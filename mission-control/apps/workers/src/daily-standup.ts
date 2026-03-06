/**
 * Daily standup generator worker.
 *
 * Aggregates last 24h of activities into a structured digest.
 * Can run as:
 *   - One-shot command: `pnpm --filter @mc/workers daily-standup`
 *   - Long-running worker: set STANDUP_LOOP=true env var
 *
 * Output goes to stdout. In the future, can be configured to send to a webhook.
 */

import { close, query } from './lib/db.js';

// ── Interfaces ──────────────────────────────────────────────────

interface ActivityCount {
  type: string;
  count: string;
}

interface AgentOfflineRow {
  name: string;
  agent_id: string;
}

interface TaskSummaryRow {
  state: string;
  count: string;
}

interface AssignmentChurnRow {
  status: string;
  count: string;
}

export interface StandupDigest {
  generated_at: string;
  period_hours: number;
  tasks_completed: number;
  tasks_blocked: number;
  tasks_created: number;
  comments_posted: number;
  agents_went_offline: AgentOfflineRow[];
  assignment_churn: Record<string, number>;
  current_task_summary: Record<string, number>;
  activity_breakdown: Record<string, number>;
}

// ── Core Logic ──────────────────────────────────────────────────

export async function generateDigest(periodHours = 24): Promise<StandupDigest> {
  const since = new Date(Date.now() - periodHours * 60 * 60 * 1000).toISOString();

  // Activity breakdown by type
  const activityResult = await query<ActivityCount>(
    `SELECT type, COUNT(*)::text as count
     FROM activities
     WHERE created_at >= $1
     GROUP BY type
     ORDER BY count DESC`,
    [since]
  );

  const activityBreakdown: Record<string, number> = {};
  for (const row of activityResult.rows) {
    activityBreakdown[row.type] = Number(row.count);
  }

  // Tasks completed (state changed to done or review in the period)
  const tasksCompletedResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM activities
     WHERE type = 'assignment.completed'
       AND created_at >= $1`,
    [since]
  );
  const tasksCompleted = Number(tasksCompletedResult.rows[0]?.count ?? 0);

  // Tasks blocked
  const tasksBlockedResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM activities
     WHERE type = 'task.state_changed'
       AND payload->>'to' = 'blocked'
       AND created_at >= $1`,
    [since]
  );
  const tasksBlocked = Number(tasksBlockedResult.rows[0]?.count ?? 0);

  // Tasks created
  const tasksCreatedResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM activities
     WHERE type = 'task.created'
       AND created_at >= $1`,
    [since]
  );
  const tasksCreated = Number(tasksCreatedResult.rows[0]?.count ?? 0);

  // Comments posted
  const commentsResult = await query<{ count: string }>(
    `SELECT COUNT(*)::text as count
     FROM activities
     WHERE type = 'comment.created'
       AND created_at >= $1`,
    [since]
  );
  const commentsPosted = Number(commentsResult.rows[0]?.count ?? 0);

  // Agents that went offline
  const offlineResult = await query<AgentOfflineRow>(
    `SELECT DISTINCT
       payload->>'name' as name,
       payload->>'agentId' as agent_id
     FROM activities
     WHERE type = 'agent.offline'
       AND created_at >= $1`,
    [since]
  );

  // Assignment churn stats
  const churnResult = await query<AssignmentChurnRow>(
    `SELECT status, COUNT(*)::text as count
     FROM assignments
     WHERE updated_at >= $1
     GROUP BY status
     ORDER BY count DESC`,
    [since]
  );

  const assignmentChurn: Record<string, number> = {};
  for (const row of churnResult.rows) {
    assignmentChurn[row.status] = Number(row.count);
  }

  // Current task summary (all tasks, not just period)
  const taskSummaryResult = await query<TaskSummaryRow>(
    `SELECT state, COUNT(*)::text as count
     FROM tasks
     GROUP BY state
     ORDER BY count DESC`
  );

  const currentTaskSummary: Record<string, number> = {};
  for (const row of taskSummaryResult.rows) {
    currentTaskSummary[row.state] = Number(row.count);
  }

  return {
    generated_at: new Date().toISOString(),
    period_hours: periodHours,
    tasks_completed: tasksCompleted,
    tasks_blocked: tasksBlocked,
    tasks_created: tasksCreated,
    comments_posted: commentsPosted,
    agents_went_offline: offlineResult.rows,
    assignment_churn: assignmentChurn,
    current_task_summary: currentTaskSummary,
    activity_breakdown: activityBreakdown
  };
}

function formatDigest(digest: StandupDigest): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════');
  lines.push(`📋 DAILY STANDUP — ${new Date(digest.generated_at).toLocaleDateString()}`);
  lines.push(`   Period: last ${digest.period_hours} hours`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  lines.push('## Summary');
  lines.push(`  ✅ Tasks completed:  ${digest.tasks_completed}`);
  lines.push(`  🚫 Tasks blocked:    ${digest.tasks_blocked}`);
  lines.push(`  📝 Tasks created:    ${digest.tasks_created}`);
  lines.push(`  💬 Comments posted:  ${digest.comments_posted}`);
  lines.push('');

  if (digest.agents_went_offline.length > 0) {
    lines.push('## Agents That Went Offline');
    for (const agent of digest.agents_went_offline) {
      lines.push(`  ⚠️  ${agent.name} (${agent.agent_id})`);
    }
    lines.push('');
  }

  if (Object.keys(digest.assignment_churn).length > 0) {
    lines.push('## Assignment Churn');
    for (const [status, count] of Object.entries(digest.assignment_churn)) {
      lines.push(`  ${status}: ${count}`);
    }
    lines.push('');
  }

  if (Object.keys(digest.current_task_summary).length > 0) {
    lines.push('## Current Task Summary');
    for (const [state, count] of Object.entries(digest.current_task_summary)) {
      lines.push(`  ${state}: ${count}`);
    }
    lines.push('');
  }

  if (Object.keys(digest.activity_breakdown).length > 0) {
    lines.push('## Activity Breakdown');
    for (const [type, count] of Object.entries(digest.activity_breakdown)) {
      lines.push(`  ${type}: ${count}`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════');
  return lines.join('\n');
}

// ── Entrypoint ──────────────────────────────────────────────────

async function run(): Promise<void> {
  console.log('daily-standup: generating digest...');

  try {
    const digest = await generateDigest();
    console.log(formatDigest(digest));
  } catch (err) {
    console.error('daily-standup: error generating digest', err);
    throw err;
  } finally {
    await close();
  }
}

run().catch((err) => {
  console.error('daily-standup: fatal error', err);
  process.exit(1);
});

export { formatDigest };
