import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeAgo } from './TimeAgo.tsx';

describe('TimeAgo', () => {
  it('renders "never" for null dates', () => {
    render(<TimeAgo date={null} />);
    expect(screen.getByText('never')).toBeInTheDocument();
  });

  it('renders "just now" for very recent dates', () => {
    const now = new Date().toISOString();
    render(<TimeAgo date={now} />);
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('renders seconds ago', () => {
    const date = new Date(Date.now() - 30_000).toISOString();
    render(<TimeAgo date={date} />);
    expect(screen.getByText('30s ago')).toBeInTheDocument();
  });

  it('renders minutes ago', () => {
    const date = new Date(Date.now() - 5 * 60_000).toISOString();
    render(<TimeAgo date={date} />);
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('renders hours ago', () => {
    const date = new Date(Date.now() - 3 * 3600_000).toISOString();
    render(<TimeAgo date={date} />);
    expect(screen.getByText('3h ago')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    render(<TimeAgo date={null} className="text-red-500" />);
    const el = screen.getByText('never');
    expect(el.className).toContain('text-red-500');
  });
});
