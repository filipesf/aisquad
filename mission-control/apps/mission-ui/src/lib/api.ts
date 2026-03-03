import type {
  Agent,
  Task,
  TaskWithAssignment,
  Assignment,
  Notification,
  Activity,
  Comment,
  TaskState,
} from '../types/domain.ts';

const BASE_URL = '/api';

class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API error ${status}: ${JSON.stringify(body)}`);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body);
  }

  return res.json() as Promise<T>;
}

// ── Agents ─────────────────────────────────────────────────────

export async function listAgents(): Promise<Agent[]> {
  return request<Agent[]>('/agents');
}

export async function getAgent(id: string): Promise<Agent> {
  return request<Agent>(`/agents/${id}`);
}

export async function getAgentNotifications(agentId: string): Promise<Notification[]> {
  return request<Notification[]>(`/agents/${agentId}/notifications`);
}

export async function getAgentAssignments(agentId: string): Promise<Assignment[]> {
  return request<Assignment[]>(`/agents/${agentId}/assignments`);
}

// ── Tasks ──────────────────────────────────────────────────────

export async function listTasks(state?: string): Promise<Task[]> {
  const qs = state ? `?state=${encodeURIComponent(state)}` : '';
  return request<Task[]>(`/tasks${qs}`);
}

export async function getTask(id: string): Promise<TaskWithAssignment> {
  return request<TaskWithAssignment>(`/tasks/${id}`);
}

export async function createTask(input: {
  title: string;
  description?: string;
  priority?: number;
  required_capabilities?: Record<string, unknown>;
}): Promise<Task> {
  return request<Task>('/tasks', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function changeTaskState(id: string, state: TaskState): Promise<Task> {
  return request<Task>(`/tasks/${id}/state`, {
    method: 'PATCH',
    body: JSON.stringify({ state }),
  });
}

// ── Assignments ────────────────────────────────────────────────

export async function getTaskAssignments(taskId: string): Promise<Assignment[]> {
  return request<Assignment[]>(`/tasks/${taskId}/assignments`);
}

// ── Comments ───────────────────────────────────────────────────

export async function listComments(taskId: string): Promise<Comment[]> {
  return request<Comment[]>(`/tasks/${taskId}/comments`);
}

export async function createComment(
  taskId: string,
  authorId: string,
  body: string,
): Promise<Comment> {
  return request<Comment>(`/tasks/${taskId}/comments?author_id=${encodeURIComponent(authorId)}`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

// ── Activities ─────────────────────────────────────────────────

export async function listActivities(limit = 50): Promise<Activity[]> {
  return request<Activity[]>(`/activities?limit=${limit}`);
}

// ── Notifications ──────────────────────────────────────────────

export async function acknowledgeNotification(id: string): Promise<Notification> {
  return request<Notification>(`/notifications/${id}/ack`, {
    method: 'POST',
  });
}

// ── SSE Stream ─────────────────────────────────────────────────

export function createActivityStream(onActivity: (activity: Activity) => void): EventSource {
  const source = new EventSource(`${BASE_URL}/activities/stream`);

  source.addEventListener('activity', (event) => {
    const activity = JSON.parse(event.data) as Activity;
    onActivity(activity);
  });

  return source;
}

export { ApiError };
