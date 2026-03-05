import { useState, useCallback } from 'react';
import type { TelemetryWindow, TelemetryGroupBy } from '../types/domain.ts';
import {
  TELEMETRY_WINDOWS,
  TELEMETRY_GROUP_BY_OPTIONS,
} from '../types/domain.ts';
import { getTelemetrySummary } from '../lib/api.ts';
import { usePolling } from '../hooks/usePolling.ts';
import { ApiError } from '../lib/api.ts';

const POLL_INTERVAL_MS = 30_000;

function TelemetryAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) return null;

  if (error.status === 401 || error.status === 403) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        <p className="font-medium">Telemetry API authorization required</p>
        <p className="mt-1 text-amber-100/90">
          Set a telemetry token in browser storage and reload:
          <code className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-xs">
            localStorage.setItem('MC_TELEMETRY_TOKEN', '&lt;token&gt;')
          </code>
        </p>
      </div>
    );
  }

  if (error.status === 503) {
    return (
      <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        <p className="font-medium">Telemetry service unavailable</p>
        <p className="mt-1">
          The server telemetry token is not configured. Check{' '}
          <code className="rounded bg-black/30 px-1 text-xs">CONTROL_API_TELEMETRY_TOKEN</code>{' '}
          on the server.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
      Failed to load telemetry: {error.message}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="text-xl font-bold text-gray-100">{value}</div>
      <div className="mt-1 text-xs capitalize text-gray-400">{label.replace(/_/g, ' ')}</div>
    </div>
  );
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: T[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
      {options.map((opt) => (
        <button
          type="button"
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
            opt === value
              ? 'bg-gray-700 text-gray-100'
              : 'text-gray-400 hover:bg-gray-800/60 hover:text-gray-300'
          }`}
        >
          {opt.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
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
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4">
        <h2 className="text-lg font-semibold text-gray-100">Telemetry</h2>
        <div className="flex items-center gap-3 ml-auto">
          <span className="text-xs text-gray-500">Window</span>
          <SegmentedControl
            value={window}
            options={TELEMETRY_WINDOWS}
            onChange={setWindow}
          />
          <span className="text-xs text-gray-500">Group by</span>
          <SegmentedControl
            value={groupBy}
            options={TELEMETRY_GROUP_BY_OPTIONS}
            onChange={setGroupBy}
          />
        </div>
      </div>

      <TelemetryAuthBanner error={error} />

      {/* Totals */}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard label="Events" value={data.totals.events.toLocaleString()} />
            <MetricCard label="Tokens" value={data.totals.tokens_total.toLocaleString()} />
            <MetricCard
              label="Cost (USD)"
              value={`$${data.totals.cost_usd.toFixed(4)}`}
            />
            <MetricCard
              label="Avg Latency"
              value={`${Math.round(data.totals.avg_duration_ms)}ms`}
            />
            <MetricCard
              label="Min Latency"
              value={`${data.totals.min_duration_ms}ms`}
            />
            <MetricCard
              label="Max Latency"
              value={`${data.totals.max_duration_ms}ms`}
            />
          </div>

          {/* Groups table */}
          {data.groups.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-800 bg-gray-900">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {groupBy.replace(/_/g, ' ')}
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Events</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Tokens</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Cost (USD)</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">Avg Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800 bg-gray-950">
                  {data.groups.map((group) => (
                    <tr key={group.key} className="hover:bg-gray-900/50">
                      <td className="px-4 py-2 font-mono text-xs text-gray-200">{group.key}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{group.events.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{group.tokens_total.toLocaleString()}</td>
                      <td className="px-4 py-2 text-right text-gray-300">${group.cost_usd.toFixed(4)}</td>
                      <td className="px-4 py-2 text-right text-gray-300">{Math.round(group.avg_duration_ms)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No telemetry events in this window.</p>
          )}

          <p className="text-xs text-gray-600">
            Last updated: {new Date(data.generated_at).toLocaleTimeString()} · auto-refreshes every 30s
          </p>
        </>
      )}

      {loading && !data && (
        <p className="text-sm text-gray-500">Loading telemetry…</p>
      )}
    </div>
  );
}
