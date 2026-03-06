import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Telemetry } from './Telemetry';
import type { TelemetrySummary } from '@/types/domain';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    getTelemetrySummary: vi.fn(),
  };
});

import { getTelemetrySummary } from '@/lib/api';

const mockSummary: TelemetrySummary = {
  window: '24h',
  group_by: 'provider',
  since: new Date(Date.now() - 86400000).toISOString(),
  generated_at: new Date().toISOString(),
  totals: {
    events: 42,
    tokens_total: 15000,
    cost_usd: 0.03,
    avg_duration_ms: 850,
    min_duration_ms: 200,
    max_duration_ms: 3200,
  },
  groups: [
    {
      key: 'anthropic',
      events: 30,
      tokens_total: 10000,
      cost_usd: 0.02,
      avg_duration_ms: 900,
      min_duration_ms: 200,
      max_duration_ms: 3200,
    },
    {
      key: 'openai',
      events: 12,
      tokens_total: 5000,
      cost_usd: 0.01,
      avg_duration_ms: 750,
      min_duration_ms: 300,
      max_duration_ms: 2100,
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTelemetrySummary).mockResolvedValue(mockSummary);
});

describe('Telemetry', () => {
  it('renders totals after data loads', async () => {
    render(<Telemetry />);
    await waitFor(() => {
      expect(screen.getByText('42')).toBeInTheDocument(); // events
      expect(screen.getByText('15,000')).toBeInTheDocument(); // tokens
    });
  });

  it('renders group rows', async () => {
    render(<Telemetry />);
    await waitFor(() => {
      expect(screen.getByText('anthropic')).toBeInTheDocument();
      expect(screen.getByText('openai')).toBeInTheDocument();
    });
  });

  it('shows loading state before data', () => {
    vi.mocked(getTelemetrySummary).mockReturnValue(new Promise(() => {}));
    render(<Telemetry />);
    // The component renders "Loading…" while the first fetch is in-flight
    expect(screen.getByText(/loading…/i)).toBeInTheDocument();
  });

  it('shows 401 auth banner on unauthorized error', async () => {
    const { ApiError } = await import('@/lib/api');
    vi.mocked(getTelemetrySummary).mockRejectedValue(
      new ApiError(401, { error: 'Missing bearer token' }),
    );
    render(<Telemetry />);
    await waitFor(() => {
      expect(screen.getByText(/Telemetry API authorization required/i)).toBeInTheDocument();
    });
  });

  it('shows 503 banner when server token is unconfigured', async () => {
    const { ApiError } = await import('@/lib/api');
    vi.mocked(getTelemetrySummary).mockRejectedValue(
      new ApiError(503, { error: 'Telemetry token is not configured' }),
    );
    render(<Telemetry />);
    await waitFor(() => {
      expect(screen.getByText(/Telemetry service unavailable/i)).toBeInTheDocument();
    });
  });
});
