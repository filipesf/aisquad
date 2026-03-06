import { useEffect, useState } from 'react';
import type { Agent, Assignment, Notification } from '@/types/domain';
import { getAgent, getAgentAssignments, getAgentNotifications } from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { Separator } from '@/components/ui/separator';

interface AgentDetailSheetProps {
  agentId: string | null;
  onClose: () => void;
}

interface AgentDetailData {
  agent: Agent;
  assignments: Assignment[];
  notifications: Notification[];
}

export function AgentDetailSheet({ agentId, onClose }: AgentDetailSheetProps) {
  const [data, setData] = useState<AgentDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!agentId) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    function fetchAll() {
      if (!agentId) return;
      Promise.all([
        getAgent(agentId),
        getAgentAssignments(agentId),
        getAgentNotifications(agentId),
      ])
        .then(([agent, assignments, notifications]) => {
          if (!cancelled) {
            setData({ agent, assignments, notifications });
            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load agent');
            setLoading(false);
          }
        });
    }

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agentId]);

  return (
    <Sheet open={!!agentId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{data?.agent.name ?? 'Agent Detail'}</SheetTitle>
          <SheetDescription>
            {data?.agent.id ? (
              <span className="font-mono text-xs">{data.agent.id}</span>
            ) : (
              'Loading…'
            )}
          </SheetDescription>
        </SheetHeader>

        {loading && !data && (
          <p className="px-4 text-sm text-muted-foreground">Loading…</p>
        )}
        {error && (
          <p className="px-4 text-sm text-destructive">{error}</p>
        )}

        {data && (
          <div className="space-y-6 px-4 pb-6">
            {/* Status */}
            <div className="flex items-center gap-3">
              <StatusBadge status={data.agent.status} />
              <span className="text-xs text-muted-foreground">
                Last seen: <TimeAgo date={data.agent.last_seen_at} />
              </span>
            </div>

            {/* Capabilities */}
            {Object.keys(data.agent.capabilities).length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Capabilities
                </p>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(data.agent.capabilities).map((cap) => (
                    <Badge key={cap} variant="secondary" className="font-mono text-xs">
                      {cap}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Recent assignments */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Assignments ({data.assignments.length})
              </p>
              {data.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments</p>
              ) : (
                <ul className="space-y-2">
                  {data.assignments.slice(0, 10).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                      <span
                        className="font-mono text-xs text-muted-foreground truncate"
                        title={a.task_id}
                      >
                        {a.task_id.slice(0, 8)}…
                      </span>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            {/* Recent notifications */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recent Notifications ({data.notifications.length})
              </p>
              {data.notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground">No notifications</p>
              ) : (
                <ul className="space-y-2">
                  {data.notifications.slice(0, 10).map((n) => (
                    <li key={n.id} className="flex items-center justify-between text-sm">
                      <span className="text-xs text-muted-foreground">{n.source_type}</span>
                      <StatusBadge status={n.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            {/* Meta */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>Created: <TimeAgo date={data.agent.created_at} /></div>
              <div>Heartbeat interval: {data.agent.heartbeat_interval_ms}ms</div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
