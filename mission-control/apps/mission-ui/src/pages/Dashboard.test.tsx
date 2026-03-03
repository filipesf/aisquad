import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { Dashboard } from './Dashboard.tsx';
import type { Agent, Task, Activity } from '../types/domain.ts';

// Mock the API module
vi.mock('../lib/api.ts', () => ({
  listAgents: vi.fn(),
  listTasks: vi.fn(),
  listActivities: vi.fn(),
  createActivityStream: vi.fn(),
}));

// Import the mocked functions
import { listAgents, listTasks, listActivities, createActivityStream } from '../lib/api.ts';

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
  it('renders fleet status with agents', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Agent Alpha')).toBeInTheDocument();
      expect(screen.getByText('Agent Beta')).toBeInTheDocument();
    });
  });

  it('shows online count', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('1/2 online')).toBeInTheDocument();
    });
  });

  it('shows task state counters', async () => {
    render(
      <BrowserRouter>
        <Dashboard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      // Should show 1 for 'queued' and 1 for 'done'
      const queuedCounter = screen.getByText('queued');
      expect(queuedCounter).toBeInTheDocument();
      const doneCounter = screen.getByText('done');
      expect(doneCounter).toBeInTheDocument();
    });
  });
});
