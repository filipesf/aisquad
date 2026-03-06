import { useState, useCallback } from 'react';
import type { TelemetryWindow, TelemetryGroupBy } from '@/types/domain';
import { TELEMETRY_WINDOWS, TELEMETRY_GROUP_BY_OPTIONS } from '@/types/domain';
import { getTelemetrySummary } from '@/lib/api';
import { ApiError } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AlertTriangle } from 'lucide-react';

const POLL_INTERVAL_MS = 30_000;

function TelemetryAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;

  if (error.status === 401 || error.status === 403) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Telemetry API authorization required</AlertTitle>
        <AlertDescription>
          Set a telemetry token in browser storage and reload:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            localStorage.setItem('MC_TELEMETRY_TOKEN', '&lt;token&gt;')
          </code>
        </AlertDescription>
      </Alert>
    );
  }

  if (error.status === 503) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Telemetry service unavailable</AlertTitle>
        <AlertDescription>
          The server telemetry token is not configured. Check{' '}
          <code className="rounded bg-muted px-1 text-xs">CONTROL_API_TELEMETRY_TOKEN</code>{' '}
          on the server.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Telemetry error</AlertTitle>
      <AlertDescription>{error.message}</AlertDescription>
    </Alert>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium capitalize text-muted-foreground">
          {label.replace(/_/g, ' ')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
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
        <h2 className="text-base font-semibold">Telemetry</h2>
        <div className="flex items-center gap-3 ml-auto flex-wrap">
          <span className="text-xs text-muted-foreground">Window</span>
          <ToggleGroup
            type="single"
            value={window}
            onValueChange={(v) => { if (v) setWindow(v as TelemetryWindow); }}
          >
            {TELEMETRY_WINDOWS.map((w) => (
              <ToggleGroupItem key={w} value={w} className="text-xs h-8 px-3">
                {w}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <span className="text-xs text-muted-foreground">Group by</span>
          <ToggleGroup
            type="single"
            value={groupBy}
            onValueChange={(v) => { if (v) setGroupBy(v as TelemetryGroupBy); }}
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
            <MetricCard label="Avg Latency" value={`${Math.round(data.totals.avg_duration_ms)}ms`} />
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
                      <TableCell className="font-mono text-xs">{group.key}</TableCell>
                      <TableCell className="text-right">{group.events.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{group.tokens_total.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${group.cost_usd.toFixed(4)}</TableCell>
                      <TableCell className="text-right">{Math.round(group.avg_duration_ms)}ms</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No telemetry events in this window.</p>
          )}

          <p className="text-xs text-muted-foreground">
            Last updated: {new Date(data.generated_at).toLocaleTimeString()} · auto-refreshes every 30s
          </p>
        </>
      )}

      {loading && !data && (
        <p className="text-sm text-muted-foreground">Loading telemetry…</p>
      )}
    </div>
  );
}
