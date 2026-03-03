#!/usr/bin/env tsx
/**
 * Seed script: creates demo agents, tasks, comments with @mentions.
 * Run via: pnpm db:seed
 */

import pg from 'pg';
import { randomUUID } from 'node:crypto';

const pool = new pg.Pool({
  host: process.env['PGHOST'] ?? 'localhost',
  port: Number(process.env['PGPORT'] ?? 5432),
  user: process.env['PGUSER'] ?? 'postgres',
  password: process.env['PGPASSWORD'] ?? 'postgres',
  database: process.env['PGDATABASE'] ?? 'mission_control',
});

// ── Demo Data ───────────────────────────────────────────────────

interface SeedAgent {
  id: string;
  name: string;
  sessionKey: string;
  capabilities: Record<string, boolean>;
  status: string;
}

const AGENTS: SeedAgent[] = [
  {
    id: randomUUID(),
    name: 'agent-alpha',
    sessionKey: `sk-alpha-${Date.now()}`,
    capabilities: { code: true, review: true },
    status: 'online',
  },
  {
    id: randomUUID(),
    name: 'agent-beta',
    sessionKey: `sk-beta-${Date.now()}`,
    capabilities: { code: true, deploy: true },
    status: 'online',
  },
  {
    id: randomUUID(),
    name: 'agent-gamma',
    sessionKey: `sk-gamma-${Date.now()}`,
    capabilities: { review: true, docs: true },
    status: 'offline',
  },
];

interface SeedTask {
  id: string;
  title: string;
  description: string;
  state: string;
  priority: number;
  requiredCapabilities: Record<string, boolean>;
}

const TASKS: SeedTask[] = [
  { id: randomUUID(), title: 'Implement user authentication', description: 'Add JWT-based auth flow', state: 'queued', priority: 8, requiredCapabilities: { code: true } },
  { id: randomUUID(), title: 'Write API documentation', description: 'Document all REST endpoints', state: 'queued', priority: 5, requiredCapabilities: { docs: true } },
  { id: randomUUID(), title: 'Fix login redirect bug', description: 'Users get stuck on /callback', state: 'queued', priority: 9, requiredCapabilities: { code: true } },
  { id: randomUUID(), title: 'Set up CI/CD pipeline', description: 'GitHub Actions workflow', state: 'assigned', priority: 7, requiredCapabilities: { deploy: true } },
  { id: randomUUID(), title: 'Code review: payment module', description: 'Review PR #42', state: 'in_progress', priority: 6, requiredCapabilities: { review: true } },
  { id: randomUUID(), title: 'Database migration for v2', description: 'Add new columns for subscriptions', state: 'in_progress', priority: 8, requiredCapabilities: { code: true } },
  { id: randomUUID(), title: 'Update error handling', description: 'Standardize error responses', state: 'review', priority: 4, requiredCapabilities: { code: true } },
  { id: randomUUID(), title: 'Performance optimization', description: 'Optimize N+1 queries', state: 'blocked', priority: 7, requiredCapabilities: { code: true } },
  { id: randomUUID(), title: 'Add monitoring alerts', description: 'Set up Prometheus alerts', state: 'done', priority: 6, requiredCapabilities: { deploy: true } },
  { id: randomUUID(), title: 'Refactor agent registry', description: 'Simplify the agent lifecycle', state: 'done', priority: 5, requiredCapabilities: { code: true, review: true } },
];

// ── Seed Functions ──────────────────────────────────────────────

async function cleanData(): Promise<void> {
  console.log('🧹 Cleaning existing data...');
  await pool.query('DELETE FROM activities');
  await pool.query('DELETE FROM subscriptions');
  await pool.query('DELETE FROM comments');
  await pool.query('DELETE FROM notifications');
  await pool.query('DELETE FROM assignments');
  await pool.query('DELETE FROM tasks');
  await pool.query('DELETE FROM agents');
}

async function seedAgents(): Promise<void> {
  console.log('👤 Creating demo agents...');
  const now = new Date().toISOString();

  for (const agent of AGENTS) {
    await pool.query(
      `INSERT INTO agents (id, name, session_key, status, capabilities, heartbeat_interval_ms, last_seen_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 10000, $6, $7, $7)`,
      [
        agent.id,
        agent.name,
        agent.sessionKey,
        agent.status,
        JSON.stringify(agent.capabilities),
        agent.status === 'online' ? now : null,
        now,
      ],
    );
    console.log(`  ✓ ${agent.name} (${agent.status})`);
  }
}

async function seedTasks(): Promise<void> {
  console.log('📋 Creating demo tasks...');
  const now = new Date().toISOString();

  for (const task of TASKS) {
    await pool.query(
      `INSERT INTO tasks (id, title, description, state, priority, required_capabilities, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
      [
        task.id,
        task.title,
        task.description,
        task.state,
        task.priority,
        JSON.stringify(task.requiredCapabilities),
        now,
      ],
    );

    // Emit task.created activity
    await pool.query(
      `INSERT INTO activities (id, type, actor_id, payload, created_at)
       VALUES ($1, 'task.created', NULL, $2, $3)`,
      [randomUUID(), JSON.stringify({ taskId: task.id, title: task.title }), now],
    );

    console.log(`  ✓ ${task.title} (${task.state})`);
  }
}

async function seedAssignments(): Promise<void> {
  console.log('🔗 Creating demo assignments...');
  const now = new Date();

  // Assign task[3] (assigned) to agent-beta
  const assignedTask = TASKS[3]!;
  const betaAgent = AGENTS[1]!;
  const a1Id = randomUUID();
  await pool.query(
    `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'offered', $4, $5, $5)`,
    [a1Id, assignedTask.id, betaAgent.id, new Date(now.getTime() + 30000).toISOString(), now.toISOString()],
  );
  await pool.query(
    `INSERT INTO activities (id, type, actor_id, payload, created_at)
     VALUES ($1, 'assignment.offered', NULL, $2, $3)`,
    [randomUUID(), JSON.stringify({ taskId: assignedTask.id, agentId: betaAgent.id, assignmentId: a1Id }), now.toISOString()],
  );
  console.log(`  ✓ ${assignedTask.title} → ${betaAgent.name} (offered)`);

  // Assign task[4] (in_progress) to agent-gamma
  const inProgressTask1 = TASKS[4]!;
  const gammaAgent = AGENTS[2]!;
  const a2Id = randomUUID();
  await pool.query(
    `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'accepted', $4, $5, $5)`,
    [a2Id, inProgressTask1.id, gammaAgent.id, new Date(now.getTime() + 60000).toISOString(), now.toISOString()],
  );
  console.log(`  ✓ ${inProgressTask1.title} → ${gammaAgent.name} (accepted)`);

  // Assign task[5] (in_progress) to agent-alpha
  const inProgressTask2 = TASKS[5]!;
  const alphaAgent = AGENTS[0]!;
  const a3Id = randomUUID();
  await pool.query(
    `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'accepted', $4, $5, $5)`,
    [a3Id, inProgressTask2.id, alphaAgent.id, new Date(now.getTime() + 60000).toISOString(), now.toISOString()],
  );
  console.log(`  ✓ ${inProgressTask2.title} → ${alphaAgent.name} (accepted)`);

  // Completed assignments for done tasks
  const doneTask1 = TASKS[8]!;
  const a4Id = randomUUID();
  await pool.query(
    `INSERT INTO assignments (id, task_id, agent_id, status, lease_expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, 'completed', NULL, $4, $4)`,
    [a4Id, doneTask1.id, betaAgent.id, now.toISOString()],
  );
  await pool.query(
    `INSERT INTO activities (id, type, actor_id, payload, created_at)
     VALUES ($1, 'assignment.completed', NULL, $2, $3)`,
    [randomUUID(), JSON.stringify({ taskId: doneTask1.id, agentId: betaAgent.id, assignmentId: a4Id }), now.toISOString()],
  );
  console.log(`  ✓ ${doneTask1.title} → ${betaAgent.name} (completed)`);
}

async function seedComments(): Promise<void> {
  console.log('💬 Creating demo comments with @mentions...');
  const now = new Date().toISOString();

  const alpha = AGENTS[0]!;
  const beta = AGENTS[1]!;
  const gamma = AGENTS[2]!;

  // Comment on task[0]
  const c1Id = randomUUID();
  await pool.query(
    `INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [c1Id, TASKS[0]!.id, alpha.id, 'Starting work on this. @agent-beta can you review the approach?', now],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [randomUUID(), TASKS[0]!.id, alpha.id, now],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [randomUUID(), TASKS[0]!.id, beta.id, now],
  );
  await pool.query(
    `INSERT INTO activities (id, type, actor_id, payload, created_at) VALUES ($1, 'comment.created', $2, $3, $4)`,
    [randomUUID(), alpha.id, JSON.stringify({ taskId: TASKS[0]!.id, commentId: c1Id }), now],
  );
  console.log(`  ✓ Comment on "${TASKS[0]!.title}" by ${alpha.name} (mentions @agent-beta)`);

  // Comment on task[4]
  const c2Id = randomUUID();
  await pool.query(
    `INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [c2Id, TASKS[4]!.id, gamma.id, 'Found a potential issue in the payment validation logic. @agent-alpha thoughts?', now],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [randomUUID(), TASKS[4]!.id, gamma.id, now],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [randomUUID(), TASKS[4]!.id, alpha.id, now],
  );
  await pool.query(
    `INSERT INTO activities (id, type, actor_id, payload, created_at) VALUES ($1, 'comment.created', $2, $3, $4)`,
    [randomUUID(), gamma.id, JSON.stringify({ taskId: TASKS[4]!.id, commentId: c2Id }), now],
  );
  console.log(`  ✓ Comment on "${TASKS[4]!.title}" by ${gamma.name} (mentions @agent-alpha)`);

  // Comment on task[7] (blocked)
  const c3Id = randomUUID();
  await pool.query(
    `INSERT INTO comments (id, task_id, author_id, body, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [c3Id, TASKS[7]!.id, beta.id, 'Blocked on database schema changes. @agent-alpha @agent-gamma need input.', now],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [randomUUID(), TASKS[7]!.id, beta.id, now],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [randomUUID(), TASKS[7]!.id, alpha.id, now],
  );
  await pool.query(
    `INSERT INTO subscriptions (id, task_id, agent_id, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [randomUUID(), TASKS[7]!.id, gamma.id, now],
  );
  await pool.query(
    `INSERT INTO activities (id, type, actor_id, payload, created_at) VALUES ($1, 'comment.created', $2, $3, $4)`,
    [randomUUID(), beta.id, JSON.stringify({ taskId: TASKS[7]!.id, commentId: c3Id }), now],
  );
  console.log(`  ✓ Comment on "${TASKS[7]!.title}" by ${beta.name} (mentions @agent-alpha, @agent-gamma)`);

  // Enqueue notifications for mentioned agents
  const notifications = [
    { target: beta.id, source: c1Id, taskId: TASKS[0]!.id, authorId: alpha.id },
    { target: alpha.id, source: c2Id, taskId: TASKS[4]!.id, authorId: gamma.id },
    { target: alpha.id, source: c3Id, taskId: TASKS[7]!.id, authorId: beta.id },
    { target: gamma.id, source: c3Id, taskId: TASKS[7]!.id, authorId: beta.id },
  ];

  for (const notif of notifications) {
    await pool.query(
      `INSERT INTO notifications (id, target_agent_id, source_type, source_id, payload, status, retry_count, created_at)
       VALUES ($1, $2, 'comment', $3, $4, 'queued', 0, $5)`,
      [
        randomUUID(),
        notif.target,
        notif.source,
        JSON.stringify({ taskId: notif.taskId, commentId: notif.source, authorId: notif.authorId }),
        now,
      ],
    );
  }
  console.log(`  ✓ Enqueued ${notifications.length} notifications`);
}

// ── Main ────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🌱 Seeding Mission Control database...\n');

  await cleanData();
  await seedAgents();
  await seedTasks();
  await seedAssignments();
  await seedComments();

  console.log('\n✅ Seed completed!');
  console.log(`   Agents: ${AGENTS.length}`);
  console.log(`   Tasks:  ${TASKS.length}`);
  console.log(`   Comments: 3 (with @mentions)`);

  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
