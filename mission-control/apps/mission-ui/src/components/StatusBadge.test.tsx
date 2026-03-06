import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="online" />);
    expect(screen.getByText('online')).toBeInTheDocument();
  });

  it('formats underscored status text', () => {
    render(<StatusBadge status="in_progress" />);
    expect(screen.getByText('in progress')).toBeInTheDocument();
  });

  it('renders online status with default badge variant', () => {
    render(<StatusBadge status="online" />);
    const badge = screen.getByText('online');
    // shadcn default variant uses bg-primary
    expect(badge.className).toContain('bg-primary');
  });

  it('renders unknown status with outline badge variant', () => {
    render(<StatusBadge status="unknown_status" />);
    const badge = screen.getByText('unknown status');
    // outline variant uses border-border
    expect(badge.className).toContain('border-border');
  });

  it('applies custom className', () => {
    render(<StatusBadge status="online" className="ml-2" />);
    const badge = screen.getByText('online');
    expect(badge.className).toContain('ml-2');
  });
});
