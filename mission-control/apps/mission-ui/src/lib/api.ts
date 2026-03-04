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

const DEFAULT_BASE_URL =
  typeof window !== 'undefined' && window.location.port === '13000'
    ? 'http://localhost:18080/api'
    : '/api';

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

const BASE_URL = env.VITE_API_BASE_URL ?? DEFAULT_BASE_URL;

const ENV_BEARER = env.VITE_API_BEARER_TOKEN;

function getBearerToken(): string | null {
  if (ENV_BEARER) return ENV_BEARER;
  if (typeof window === 'undefined') return null;
  const token = window.localStorage.getItem('MC_AGENT_TOKEN');
  return token && token.trim().length > 0 ? token : null;
}

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
  const token = getBearerToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body ?? { error: res.statusText });
  }

  return body as T;
}

type TaskLike = Partial<Task> & {
  status?: string;
  priority?: number | string;
  required_capabilities?: Record<string, unknown>;
};

function normalizeTaskState(task: TaskLike): TaskState {
  const value = String(task.state ?? task.status ?? 'queued');
  const mapped: Record<string, TaskState> = {
    queued: 'queued',
    inbox: 'queued',
    triage: 'assigned',
    assigned: 'assigned',
    in_progress: 'in_progress',
    review: 'review',
    done: 'done',
    completed: 'done',
    blocked: 'blocked',
  };
  return mapped[value] ?? 'queued';
}

function normalizePriority(priority: TaskLike['priority']): number {
  if (typeof priority === 'number') return priority;
  const mapped: Record<string, number> = {
    low: 2,
    medium: 5,
    high: 8,
    urgent: 10,
  };
  return mapped[String(priority ?? '').toLowerCase()] ?? 5;
}

function normalizeTask(raw: TaskLike): Task {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? ''),
    description: String(raw.description ?? ''),
    state: normalizeTaskState(raw),
    priority: normalizePriority(raw.priority),
    required_capabilities: raw.required_capabilities ?? {},
    created_at: String(raw.created_at ?? new Date().toISOString()),
    updated_at: String(raw.updated_at ?? new Date().toISOString()),
  };
}

// ── Agents ─────────────────────────────────────────────────────

export async function listAgents(): Promise<Agent[]> {
  try {
    const data = await request<Agent[] | { agents?: Agent[] }>('/agents');
    if (Array.isArray(data)) return data;
    return data.agents ?? [];
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return [];
    }
    throw err;
  }
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
  const data = await request<TaskLike[] | { tasks?: TaskLike[] }>(`/tasks${qs}`);
  const list = Array.isArray(data) ? data : (data.tasks ?? []);
  return list.map(normalizeTask);
}

export async function getTask(id: string): Promise<TaskWithAssignment> {
  const data = await request<
    TaskLike | { task?: TaskLike; current_assignment?: Assignment | null; status?: string }
  >(`/tasks/${id}`);

  const raw =
    'task' in (data as Record<string, unknown>)
      ? ((data as { task?: TaskLike }).task ?? {})
      : (data as TaskLike);
  const current_assignment =
    'current_assignment' in (data as Record<string, unknown>)
      ? ((data as { current_assignment?: Assignment | null }).current_assignment ?? null)
      : null;

  return {
    ...normalizeTask(raw),
    current_assignment,
  };
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
  try {
    const task = await request<TaskLike>(`/tasks/${id}/state`, {
      method: 'PATCH',
      body: JSON.stringify({ state }),
    });
    return normalizeTask(task);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status === 404) {
      throw err;
    }

    const statusMap: Record<TaskState, string> = {
      queued: 'inbox',
      assigned: 'triage',
      in_progress: 'in_progress',
      review: 'review',
      done: 'done',
      blocked: 'blocked',
    };

    const task = await request<TaskLike>(`/tasks/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ to_state: statusMap[state] }),
    });
    return normalizeTask(task);
  }
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
