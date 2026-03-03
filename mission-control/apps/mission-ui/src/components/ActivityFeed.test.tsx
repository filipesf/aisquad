import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ActivityFeed } from './ActivityFeed.tsx';
import type { Activity } from '../types/domain.ts';

const mockActivities: Activity[] = [
  {
    id: '1',
    type: 'task.created',
    actor_id: null,
    payload: { title: 'Fix bug' },
    created_at: new Date().toISOString(),
  },
  {
    id: '2',
    type: 'agent.online',
    actor_id: 'agent-1',
    payload: {},
    created_at: new Date().toISOString(),
  },
  {
    id: '3',
    type: 'assignment.expired',
    actor_id: null,
    payload: {},
    created_at: new Date().toISOString(),
  },
];

describe('ActivityFeed', () => {
  it('renders activity items', () => {
    render(<ActivityFeed activities={mockActivities} connected={true} />);
    expect(screen.getByText(/Task created: Fix bug/)).toBeInTheDocument();
    expect(screen.getByText(/Agent came online/)).toBeInTheDocument();
    expect(screen.getByText(/Assignment expired/)).toBeInTheDocument();
  });

  it('shows "No activities yet" when empty', () => {
    render(<ActivityFeed activities={[]} connected={true} />);
    expect(screen.getByText('No activities yet')).toBeInTheDocument();
  });

  it('shows connected status', () => {
    render(<ActivityFeed activities={[]} connected={true} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows disconnected status', () => {
    render(<ActivityFeed activities={[]} connected={false} />);
    expect(screen.getByText('Reconnecting...')).toBeInTheDocument();
  });
});
