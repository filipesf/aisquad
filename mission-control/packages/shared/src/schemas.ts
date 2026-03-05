import { z } from 'zod';

// ── Agent Schemas ──────────────────────────────────────────────

export const AgentStatus = z.enum(['online', 'offline', 'draining']);
export type AgentStatus = z.infer<typeof AgentStatus>;

export const CreateAgentSchema = z.object({
  name: z.string().min(1).max(255),
  session_key: z.string().min(1).max(255),
  capabilities: z.record(z.unknown()).default({}),
  heartbeat_interval_ms: z.number().int().min(1000).max(300_000).default(10_000),
});
export type CreateAgentInput = z.infer<typeof CreateAgentSchema>;

export const HeartbeatSchema = z.object({
  sequence_id: z.string().optional(),
});
export type HeartbeatInput = z.infer<typeof HeartbeatSchema>;

export const AgentSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  session_key: z.string(),
  status: AgentStatus,
  capabilities: z.record(z.unknown()),
  heartbeat_interval_ms: z.number(),
  last_seen_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Agent = z.infer<typeof AgentSchema>;

// ── Task Schemas ───────────────────────────────────────────────

export const TaskState = z.enum(['queued', 'assigned', 'in_progress', 'review', 'done', 'blocked']);
export type TaskState = z.infer<typeof TaskState>;

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().default(''),
  priority: z.number().int().min(0).max(10).default(5),
  required_capabilities: z.record(z.unknown()).default({}),
});
export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;

export const TaskSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  state: TaskState,
  priority: z.number(),
  required_capabilities: z.record(z.unknown()),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Task = z.infer<typeof TaskSchema>;

// ── Assignment Schemas ─────────────────────────────────────────

export const AssignmentStatus = z.enum([
  'offered',
  'accepted',
  'started',
  'completed',
  'expired',
  'cancelled',
]);
export type AssignmentStatus = z.infer<typeof AssignmentStatus>;

export const AssignmentSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  status: AssignmentStatus,
  lease_expires_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Assignment = z.infer<typeof AssignmentSchema>;

// ── Notification Schemas ───────────────────────────────────────

export const NotificationStatus = z.enum(['queued', 'delivered', 'failed']);
export type NotificationStatus = z.infer<typeof NotificationStatus>;

export const NotificationSchema = z.object({
  id: z.string().uuid(),
  target_agent_id: z.string().uuid(),
  source_type: z.string(),
  source_id: z.string().uuid(),
  payload: z.record(z.unknown()),
  status: NotificationStatus,
  delivered_at: z.string().nullable(),
  retry_count: z.number(),
  created_at: z.string(),
});
export type Notification = z.infer<typeof NotificationSchema>;

// ── Activity Schemas ───────────────────────────────────────────

export const ActivitySchema = z.object({
  id: z.string().uuid(),
  type: z.string(),
  actor_id: z.string().uuid().nullable(),
  payload: z.record(z.unknown()),
  created_at: z.string(),
});
export type Activity = z.infer<typeof ActivitySchema>;

// ── Comment Schemas ────────────────────────────────────────────

export const CreateCommentSchema = z.object({
  body: z.string().min(1),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const CommentSchema = z.object({
  id: z.string().uuid(),
  task_id: z.string().uuid(),
  author_id: z.string().uuid(),
  body: z.string(),
  created_at: z.string(),
});
export type Comment = z.infer<typeof CommentSchema>;

// ── OpenClaw Integration Schemas ───────────────────────────────

/**
 * Per-agent OpenClaw capability metadata stored in `agents.capabilities.openclaw`.
 * When `enabled: true`, the agent is backed by an OpenClaw gateway agent.
 */
export const OpenClawCapabilitySchema = z.object({
  enabled: z.boolean().default(false),
  agentName: z.string(),
  agentId: z.string(),
  model: z.string().optional(),
  channel: z.string().optional(),
  to: z.string().optional(),
});
export type OpenClawCapability = z.infer<typeof OpenClawCapabilitySchema>;

/**
 * Payload sent to OpenClaw `POST /hooks/agent` for assignment dispatch.
 */
export const OpenClawHookRequestSchema = z.object({
  agent: z.string(),
  model: z.string().optional(),
  message: z.string(),
  metadata: z.object({
    assignmentId: z.string().uuid(),
    taskId: z.string().uuid(),
    agentId: z.string().uuid(),
    correlationId: z.string().optional(),
  }),
});
export type OpenClawHookRequest = z.infer<typeof OpenClawHookRequestSchema>;

/**
 * Response from OpenClaw `POST /hooks/agent`.
 */
export const OpenClawHookResponseSchema = z.object({
  ok: z.boolean(),
  response: z.string().optional(),
  error: z.string().optional(),
});
export type OpenClawHookResponse = z.infer<typeof OpenClawHookResponseSchema>;

// ── Telemetry Schemas ───────────────────────────────────────────

export const IngestTelemetryEventSchema = z.object({
  agent_id: z.string().uuid().optional(),
  event_type: z.string().min(1),
  provider: z.string().optional(),
  model: z.string().optional(),
  channel: z.string().optional(),
  session_key: z.string().optional(),
  tokens_input: z.number().int().nonnegative().optional(),
  tokens_output: z.number().int().nonnegative().optional(),
  tokens_cache_read: z.number().int().nonnegative().optional(),
  tokens_cache_write: z.number().int().nonnegative().optional(),
  tokens_total: z.number().int().nonnegative().optional(),
  cost_usd: z.number().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  payload: z.record(z.unknown()).default({}),
  recorded_at: z.string().datetime().optional(),
});
export type IngestTelemetryEvent = z.infer<typeof IngestTelemetryEventSchema>;

export const IngestTelemetryBatchSchema = z.object({
  events: z.array(IngestTelemetryEventSchema).min(1).max(500),
});
export type IngestTelemetryBatch = z.infer<typeof IngestTelemetryBatchSchema>;
