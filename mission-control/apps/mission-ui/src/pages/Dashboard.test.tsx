import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Dashboard } from './Dashboard';
import type { Agent, Task, Activity } from '@/types/domain';

// Mock the API module
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    listAgents: vi.fn(),
    listTasks: vi.fn(),
    listActivities: vi.fn(),
    createActivityStream: vi.fn(),
  };
});

import { listAgents, listTasks, listActivities, createActivityStream } from '@/lib/api';

const mockAgents: Agent[] = [
  {
    id: 'a1',
    name: 'Agent Alpha',
    session_key: 'key-a',
    status: 'online',
    capabilities: {},
    heartbeat_interval_ms: 10000,
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'a2',
    name: 'Agent Beta',
    session_key: 'key-b',
    status: 'offline',
    capabilities: {},
    heartbeat_interval_ms: 10000,
    last_seen_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockTasks: Task[] = [
  {
    id: 't1',
    title: 'Task One',
    description: '',
    state: 'queued',
    priority: 5,
    required_capabilities: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't2',
    title: 'Task Two',
    description: '',
    state: 'done',
    priority: 3,
    required_capabilities: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockActivities: Activity[] = [];

function createMockEventSource() {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listAgents).mockResolvedValue(mockAgents);
  vi.mocked(listTasks).mockResolvedValue(mockTasks);
  vi.mocked(listActivities).mockResolvedValue(mockActivities);
  vi.mocked(createActivityStream).mockReturnValue(
    createMockEventSource() as unknown as EventSource,
  );
});

describe('Dashboard', () => {
  it('renders fleet table with agents', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
      expect(screen.getByText('Agent Beta')).toBeInTheDocument();
    });
  });

  it('shows online count', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('1/2 online')).toBeInTheDocument();
    });
  });

  it('shows task states in the tasks table', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      // Tasks table shows task state via StatusBadge
      expect(screen.getByText('queued')).toBeInTheDocument();
      expect(screen.getByText('done')).toBeInTheDocument();
    });
  });

  it('renders tasks table with tasks', async () => {
    render(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Task One')).toBeInTheDocument();
      expect(screen.getByText('Task Two')).toBeInTheDocument();
    });
  });
});
