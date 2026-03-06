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
    // getActivityDescription produces these strings for the mock events
    expect(screen.getByText('New task: Fix bug')).toBeInTheDocument();
    expect(screen.getByText('Agent came online')).toBeInTheDocument();
    expect(screen.getByText('Assignment timed out')).toBeInTheDocument();
  });

  it('shows empty state message when there are no activities', () => {
    render(<ActivityFeed activities={[]} connected={true} />);
    // The empty state rotates through several dry-wit messages based on the
    // current minute — match any one of them with a partial regex.
    expect(
      screen.getByText(
        (text) =>
          text.includes('No activity yet') ||
          text.includes('All quiet') ||
          text.includes('agents work') ||
          text.includes('standing by') ||
          text.includes('Waiting for something'),
      ),
    ).toBeInTheDocument();
  });

  it('shows connected status', () => {
    render(<ActivityFeed activities={[]} connected={true} />);
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('shows disconnected status', () => {
    render(<ActivityFeed activities={[]} connected={false} />);
    // Component uses the Unicode ellipsis character (…), not three dots (...)
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });
});
