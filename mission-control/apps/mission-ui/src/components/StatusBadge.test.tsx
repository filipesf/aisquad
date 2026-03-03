import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge.tsx';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="online" />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('formats underscored status text', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('applies the correct styles for online status', () => {
    render(<StatusBadge status="online" />);
    const badge = screen.getByText('online');
    expect(badge.className).toContain('text-emerald-400');
  });

  it('applies default styles for unknown status', () => {
    render(<StatusBadge status="unknown_status" />);
    const badge = screen.getByText('unknown status');
    expect(badge.className).toContain('text-gray-400');
  });

  it('applies custom className', () => {
    render(<StatusBadge status="online" className="ml-2" />);
    const badge = screen.getByText('online');
    expect(badge.className).toContain('ml-2');
  });
});
