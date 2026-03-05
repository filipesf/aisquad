import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { TaskBoard } from './TaskBoard.tsx';
import type { Task } from '../types/domain.ts';

vi.mock('../lib/api.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api.ts')>();
  return {
    ...actual,
    listTasks: vi.fn(),
    changeTaskState: vi.fn(),
    createTask: vi.fn(),
  };
});

import { listTasks } from '../lib/api.ts';

const mockTasks: Task[] = [
  {
    id: 't1',
    title: 'Fix login bug',
    description: 'Users cannot login',
    state: 'queued',
    priority: 8,
    required_capabilities: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't2',
    title: 'Add dark mode',
    description: '',
    state: 'in_progress',
    priority: 5,
    required_capabilities: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't3',
    title: 'Write docs',
    description: '',
    state: 'done',
    priority: 3,
    required_capabilities: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(listTasks).mockResolvedValue(mockTasks);
});

describe('TaskBoard', () => {
  it('renders all kanban columns', async () => {
    render(
      <BrowserRouter>
        <TaskBoard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('queued')).toBeInTheDocument();
      expect(screen.getByText('assigned')).toBeInTheDocument();
      expect(screen.getByText('in progress')).toBeInTheDocument();
      expect(screen.getByText('review')).toBeInTheDocument();
      expect(screen.getByText('done')).toBeInTheDocument();
      expect(screen.getByText('blocked')).toBeInTheDocument();
    });
  });

  it('renders task cards in correct columns', async () => {
    render(
      <BrowserRouter>
        <TaskBoard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('Fix login bug')).toBeInTheDocument();
      expect(screen.getByText('Add dark mode')).toBeInTheDocument();
      expect(screen.getByText('Write docs')).toBeInTheDocument();
    });
  });

  it('shows the new task button', async () => {
    render(
      <BrowserRouter>
        <TaskBoard />
      </BrowserRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('+ New Task')).toBeInTheDocument();
    });
  });
});
