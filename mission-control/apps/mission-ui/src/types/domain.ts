// Domain types matching the API responses (mirrors @mc/shared schemas)

export type AgentStatus = 'online' | 'offline' | 'draining';

export interface Agent {
  id: string;
  name: string;
  session_key: string;
  status: AgentStatus;
  capabilities: Record<string, unknown>;
  heartbeat_interval_ms: number;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TaskState = 'queued' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked';

export const TASK_STATES: TaskState[] = ['queued', 'assigned', 'in_progress', 'review', 'done', 'blocked'];

export interface Task {
  id: string;
  title: string;
  description: string;
  state: TaskState;
  priority: number;
  required_capabilities: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaskWithAssignment extends Task {
  current_assignment: Assignment | null;
}

export type AssignmentStatus = 'offered' | 'accepted' | 'started' | 'completed' | 'expired' | 'cancelled';

export interface Assignment {
  id: string;
  task_id: string;
  agent_id: string;
  status: AssignmentStatus;
  lease_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export type NotificationStatus = 'queued' | 'delivered' | 'failed';

export interface Notification {
  id: string;
  target_agent_id: string;
  source_type: string;
  source_id: string;
  payload: Record<string, unknown>;
  status: NotificationStatus;
  delivered_at: string | null;
  retry_count: number;
  created_at: string;
}

export interface Activity {
  id: string;
  type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

// ── Telemetry ──────────────────────────────────────────────────

export type TelemetryWindow = '1h' | '6h' | '24h' | '7d';
export type TelemetryGroupBy = 'provider' | 'model' | 'agent' | 'event_type' | 'channel';

export const TELEMETRY_WINDOWS: TelemetryWindow[] = ['1h', '6h', '24h', '7d'];
export const TELEMETRY_GROUP_BY_OPTIONS: TelemetryGroupBy[] = [
  'provider', 'model', 'agent', 'event_type', 'channel',
];

export interface TelemetryTotals {
  events: number;
  tokens_total: number;
  cost_usd: number;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
}

export interface TelemetryGroup extends TelemetryTotals {
  key: string;
}

export interface TelemetrySummary {
  window: TelemetryWindow;
  group_by: TelemetryGroupBy;
  since: string;
  generated_at: string;
  totals: TelemetryTotals;
  groups: TelemetryGroup[];
}
