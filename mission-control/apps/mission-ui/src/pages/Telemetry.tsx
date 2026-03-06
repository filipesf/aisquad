import { useState, useCallback } from 'react';
import type { TelemetryWindow, TelemetryGroupBy } from '@/types/domain';
import { TELEMETRY_WINDOWS, TELEMETRY_GROUP_BY_OPTIONS } from '@/types/domain';
import { getTelemetrySummary } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import { MetricCard } from '@/components/MetricCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const POLL_INTERVAL_MS = 30_000;

function TelemetryAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;

  if (error.status === 401 || error.status === 403) {
    return (
      <ErrorBanner
        variant="default"
        title="Telemetry API authorization required"
        description={
          <>
            Set a telemetry token in browser storage and reload:{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              localStorage.setItem('MC_TELEMETRY_TOKEN', '&lt;token&gt;')
            </code>
          </>
        }
      />
    );
  }

  if (error.status === 503) {
    return (
      <ErrorBanner
        title="Telemetry service unavailable"
        description={
          <>
            The server telemetry token is not configured. Check{' '}
            <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">
              CONTROL_API_TELEMETRY_TOKEN
            </code>{' '}
            on the server.
          </>
        }
      />
    );
  }

  return <ErrorBanner title="Telemetry error" description={error.message} />;
}

export function Telemetry() {
  const [window, setWindow] = useState<TelemetryWindow>('24h');
  const [groupBy, setGroupBy] = useState<TelemetryGroupBy>('provider');

  const fetcher = useCallback(
    () => getTelemetrySummary({ window, group_by: groupBy }),
    [window, groupBy],
  );

  const { data, error, loading } = usePolling(fetcher, POLL_INTERVAL_MS);

  return (
    <div className="p-6 space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-sm font-semibold tracking-tight">Telemetry</h2>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <span className="text-xs text-muted-foreground" id="window-label">
            Window
          </span>
          <ToggleGroup
            type="single"
            value={window}
            onValueChange={(v) => {
              if (v) setWindow(v as TelemetryWindow);
            }}
            aria-labelledby="window-label"
          >
            {TELEMETRY_WINDOWS.map((w) => (
              <ToggleGroupItem key={w} value={w} className="text-xs h-8 px-3">
                {w}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-xs text-muted-foreground" id="groupby-label">
            Group by
          </span>
          <ToggleGroup
            type="single"
            value={groupBy}
            onValueChange={(v) => {
              if (v) setGroupBy(v as TelemetryGroupBy);
            }}
            aria-labelledby="groupby-label"
          >
            {TELEMETRY_GROUP_BY_OPTIONS.map((g) => (
              <ToggleGroupItem key={g} value={g} className="text-xs h-8 px-3 capitalize">
                {g.replace(/_/g, ' ')}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {error && <TelemetryAuthBanner error={error} />}

      {data && (
        <>
          {/* Totals */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Events" value={data.totals.events.toLocaleString()} />
            <MetricCard label="Tokens" value={data.totals.tokens_total.toLocaleString()} />
            <MetricCard label="Cost (USD)" value={`$${data.totals.cost_usd.toFixed(4)}`} />
            <MetricCard
              label="Avg Latency"
              value={`${Math.round(data.totals.avg_duration_ms)}ms`}
            />
            <MetricCard label="Min Latency" value={`${data.totals.min_duration_ms}ms`} />
            <MetricCard label="Max Latency" value={`${data.totals.max_duration_ms}ms`} />
          </div>

          {/* Groups table */}
          {data.groups.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="capitalize">{groupBy.replace(/_/g, ' ')}</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Cost (USD)</TableHead>
                    <TableHead className="text-right">Avg Latency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.groups.map((group) => (
                    <TableRow key={group.key}>
                      <TableCell
                        className="font-mono text-xs truncate max-w-[200px]"
                        title={group.key}
                      >
                        {group.key}
                      </TableCell>
                      <TableCell className="text-right">{group.events.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {group.tokens_total.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">${group.cost_usd.toFixed(4)}</TableCell>
                      <TableCell className="text-right">
                        {Math.round(group.avg_duration_ms)}ms
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No telemetry events in this window.</p>
          )}

          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(data.generated_at).toLocaleTimeString()} · auto-refreshes every
            30s
          </p>
        </>
      )}

      {loading && !data && <p className="text-sm text-muted-foreground">Loading…</p>}
    </div>
  );
}
