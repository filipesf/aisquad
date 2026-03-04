#!/usr/bin/env tsx
import { execFileSync } from 'node:child_process';
import pg from 'pg';

type OpenClawAgent = {
  id: string;
  name?: string;
  model?: string | null;
  workspace?: string | null;
};

type McAgent = {
  id: string;
  name: string;
  session_key: string;
  status: 'online' | 'offline' | 'draining';
  capabilities: Record<string, unknown>;
};

const VM = process.env['OPENCLAW_VM'] ?? 'aisquad';
const OPENCLAW_STATE_PATH =
  process.env['OPENCLAW_STATE_PATH'] ?? '/home/filipefernandes/.openclaw/openclaw.json';
const CONTROL_API_URL = process.env['CONTROL_API_URL'] ?? 'http://localhost:3000';

const pool = new pg.Pool({
  host: process.env['PGHOST'] ?? 'localhost',
  port: Number(process.env['PGPORT'] ?? 5432),
  user: process.env['PGUSER'] ?? 'postgres',
  password: process.env['PGPASSWORD'] ?? 'postgres',
  database: process.env['PGDATABASE'] ?? 'mission_control',
});

function getOpenClawAgentsFromVm(): OpenClawAgent[] {
  const nodeScript = [
    'const fs=require("fs")',
    'const p=process.argv[1]',
    'const cfg=JSON.parse(fs.readFileSync(p,"utf8"))',
    'const list=Array.isArray(cfg?.agents?.list)?cfg.agents.list:[]',
    'const out=list.map(a=>({id:String(a.id),name:a.name?String(a.name):undefined,model:a.model?String(a.model):null,workspace:a.workspace?String(a.workspace):null}))',
    'process.stdout.write(JSON.stringify(out))',
  ].join(';');

  const stdout = execFileSync(
    'orb',
    ['-m', VM, 'bash', '-lc', `node -e '${nodeScript}' "${OPENCLAW_STATE_PATH}"`],
    { encoding: 'utf8' },
  );

  const parsed = JSON.parse(stdout) as OpenClawAgent[];
  return parsed.filter((a) => a.id);
}

async function listMissionControlAgents(): Promise<McAgent[]> {
  const res = await fetch(`${CONTROL_API_URL}/agents`);
  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`GET /agents failed: HTTP ${res.status} ${body}`);
  }
  return (await res.json()) as McAgent[];
}

function getOpenClawCap(agent: McAgent): Record<string, unknown> | null {
  const raw = agent.capabilities?.['openclaw'];
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
}

function findMatchingMcAgent(openclawAgent: OpenClawAgent, mcAgents: McAgent[]): McAgent | undefined {
  const byCapability = mcAgents.find((mc) => {
    const cap = getOpenClawCap(mc);
    return cap?.['agentId'] === openclawAgent.id;
  });
  if (byCapability) return byCapability;

  const targetName = (openclawAgent.name ?? openclawAgent.id).toLowerCase();
  return mcAgents.find((mc) => mc.name.toLowerCase() === targetName);
}

async function createAgent(openclawAgent: OpenClawAgent): Promise<McAgent> {
  const payload = {
    name: openclawAgent.name ?? openclawAgent.id,
    session_key: `openclaw:${openclawAgent.id}`,
    heartbeat_interval_ms: 10_000,
    capabilities: {
      openclaw: {
        enabled: true,
        agentName: openclawAgent.id,
        agentId: openclawAgent.id,
        model: openclawAgent.model ?? undefined,
      },
    },
  };

  const res = await fetch(`${CONTROL_API_URL}/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(
      `POST /agents failed for ${openclawAgent.id}: HTTP ${res.status} ${body}`,
    );
  }

  return (await res.json()) as McAgent;
}

async function upsertAgentFields(agentId: string, openclawAgent: OpenClawAgent): Promise<void> {
  const nextName = openclawAgent.name ?? openclawAgent.id;
  const nextSessionKey = `openclaw:${openclawAgent.id}`;
  const nextCapabilities = {
    openclaw: {
      enabled: true,
      agentName: openclawAgent.id,
      agentId: openclawAgent.id,
      model: openclawAgent.model ?? undefined,
    },
  };

  await pool.query(
    `UPDATE agents
     SET name = $2,
         session_key = $3,
         capabilities = $4::jsonb,
         updated_at = now()
     WHERE id = $1`,
    [agentId, nextName, nextSessionKey, JSON.stringify(nextCapabilities)],
  );
}

async function markMissingOpenClawAgentsOffline(
  mcAgents: McAgent[],
  activeOpenClawIds: Set<string>,
): Promise<number> {
  let changed = 0;

  for (const mc of mcAgents) {
    const cap = getOpenClawCap(mc);
    const enabled = cap?.['enabled'] === true;
    const agentId = typeof cap?.['agentId'] === 'string' ? cap['agentId'] : null;
    if (!enabled || !agentId) continue;
    if (activeOpenClawIds.has(agentId)) continue;

    const nextCapabilities = {
      ...mc.capabilities,
      openclaw: {
        ...cap,
        enabled: false,
      },
    };

    await pool.query(
      `UPDATE agents
       SET status = 'offline', capabilities = $2::jsonb, updated_at = now()
       WHERE id = $1`,
      [mc.id, JSON.stringify(nextCapabilities)],
    );
    changed++;
  }

  return changed;
}

async function heartbeatAgent(agentId: string): Promise<void> {
  const res = await fetch(`${CONTROL_API_URL}/agents/${agentId}/heartbeat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    throw new Error(`POST /agents/${agentId}/heartbeat failed: HTTP ${res.status} ${body}`);
  }
}

async function main(): Promise<void> {
  const openclawAgents = getOpenClawAgentsFromVm();
  const mcAgents = await listMissionControlAgents();

  const activeOpenClawIds = new Set(openclawAgents.map((a) => a.id));
  const syncedAgentIds: string[] = [];

  let created = 0;
  let updated = 0;

  for (const oc of openclawAgents) {
    const existing = findMatchingMcAgent(oc, mcAgents);

    if (!existing) {
      const createdAgent = await createAgent(oc);
      syncedAgentIds.push(createdAgent.id);
      created++;
      continue;
    }

    await upsertAgentFields(existing.id, oc);
    syncedAgentIds.push(existing.id);
    updated++;
  }

  const disabled = await markMissingOpenClawAgentsOffline(mcAgents, activeOpenClawIds);

  for (const id of syncedAgentIds) {
    await heartbeatAgent(id);
  }

  const refreshed = await listMissionControlAgents();
  const fleet = refreshed.map((a) => `${a.name}:${a.status}`).join(', ');

  console.log(`openclaw-agent-sync: synced ${openclawAgents.length} OpenClaw agent(s)`);
  console.log(`openclaw-agent-sync: created=${created} updated=${updated} disabled=${disabled}`);
  console.log(`openclaw-agent-sync: fleet -> ${fleet}`);
}

main()
  .catch((err) => {
    console.error('openclaw-agent-sync: failed', err);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
