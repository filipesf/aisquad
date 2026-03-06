import { useState, useCallback } from 'react';
import type { TelemetryWindow, TelemetryGroupBy } from '@/types/domain';
import { TELEMETRY_WINDOWS, TELEMETRY_GROUP_BY_OPTIONS } from '@/types/domain';
import { getTelemetrySummary } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import { MetricCard } from '@/components/MetricCard';
import { ErrorBanner } from '@/components/ErrorBanner';
import { TableShell } from '@/components/ui/TableShell';
import { InlineCode } from '@/components/ui/InlineCode';
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
        title="Telemetry access token required"
        description={
          <>
            Paste your telemetry token in the browser console, then reload the page:{' '}
            <InlineCode>localStorage.setItem('MC_TELEMETRY_TOKEN', '&lt;token&gt;')</InlineCode>
          </>
        }
      />
    );
  }

  if (error.status === 503) {
    return (
      <ErrorBanner
        title="Telemetry not configured on the server"
        description={
          <>
            The server is missing its telemetry token. Set{' '}
            <InlineCode>CONTROL_API_TELEMETRY_TOKEN</InlineCode> and restart the API.
          </>
        }
      />
    );
  }

  return <ErrorBanner title="Something went wrong loading telemetry" description={error.message} />;
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
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
          Telemetry
        </h2>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <span className="text-xs text-muted-foreground" id="window-label">
            Period
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
          {/* Totals — stagger cascades left-to-right on each data load */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="Events"
              value={data.totals.events.toLocaleString()}
              staggerIndex={0}
            />
            <MetricCard
              label="Tokens"
              value={data.totals.tokens_total.toLocaleString()}
              staggerIndex={1}
            />
            <MetricCard
              label="Cost (USD)"
              value={`$${data.totals.cost_usd.toFixed(4)}`}
              staggerIndex={2}
            />
            <MetricCard
              label="Avg Latency"
              value={`${Math.round(data.totals.avg_duration_ms)}ms`}
              staggerIndex={3}
            />
            <MetricCard
              label="Min Latency"
              value={`${data.totals.min_duration_ms}ms`}
              staggerIndex={4}
            />
            <MetricCard
              label="Max Latency"
              value={`${data.totals.max_duration_ms}ms`}
              staggerIndex={5}
            />
          </div>

          {/* Groups table */}
          {data.groups.length > 0 ? (
            <TableShell>
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
            </TableShell>
          ) : (
            <p className="text-sm text-muted-foreground">No data for this time period.</p>
          )}

          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(data.generated_at).toLocaleTimeString()} · refreshes every 30s
          </p>
        </>
      )}

      {loading && !data && (
        /* Shimmer skeleton — communicates that data is loading without a spinner */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-hidden="true">
          {(['events', 'tokens', 'cost', 'avg-lat', 'min-lat', 'max-lat'] as const).map((k) => (
            <div key={k} className="rounded-md border px-4 py-3 skeleton-shimmer bg-muted/40">
              <div className="h-3 w-12 rounded bg-muted mb-3" />
              <div className="h-6 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
