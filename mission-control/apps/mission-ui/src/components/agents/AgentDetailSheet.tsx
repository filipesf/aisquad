import { useEffect, useState } from 'react';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { Badge } from '@/components/ui/badge';
import { MonoId } from '@/components/ui/MonoId';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { getAgent, getAgentAssignments, getAgentNotifications } from '@/lib/api';
import type { Agent, Assignment, Notification } from '@/types/domain';

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
      Promise.all([getAgent(agentId), getAgentAssignments(agentId), getAgentNotifications(agentId)])
        .then(([agent, assignments, notifications]) => {
          if (!cancelled) {
            setData({ agent, assignments, notifications });
            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Couldn't load agent details");
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
    <Sheet
      open={!!agentId}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="mb-4">
          <SheetTitle>{data?.agent.name ?? 'Agent'}</SheetTitle>
          <SheetDescription>
            {data?.agent.id ? (
              <MonoId>{data.agent.id}</MonoId>
            ) : (
              <span className="font-mono text-xs">—</span>
            )}
          </SheetDescription>
        </SheetHeader>

        {loading && !data && <p className="px-4 text-muted-foreground text-sm">Loading agent…</p>}
        {error && <p className="px-4 text-destructive text-sm">{error}</p>}

        {data && (
          <div className="space-y-6 px-4 pb-6">
            {/* Status */}
            <div className="flex items-center gap-3">
              <StatusBadge status={data.agent.status} />
              <span className="text-muted-foreground text-xs">
                Last seen: <TimeAgo date={data.agent.last_seen_at} />
              </span>
            </div>

            {/* Capabilities */}
            {Object.keys(data.agent.capabilities).length > 0 && (
              <div>
                <SectionLabel>Capabilities</SectionLabel>
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
              <SectionLabel>Assignments ({data.assignments.length})</SectionLabel>
              {data.assignments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No assignments yet</p>
              ) : (
                <ul className="space-y-2">
                  {data.assignments.slice(0, 10).map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 text-sm">
                      <MonoId slice={8}>{a.task_id}</MonoId>
                      <StatusBadge status={a.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            {/* Recent notifications */}
            <div>
              <SectionLabel>Notifications ({data.notifications.length})</SectionLabel>
              {data.notifications.length === 0 ? (
                <p className="text-muted-foreground text-sm">No notifications yet</p>
              ) : (
                <ul className="space-y-2">
                  {data.notifications.slice(0, 10).map((n) => (
                    <li key={n.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground text-xs">{n.source_type}</span>
                      <StatusBadge status={n.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <Separator />

            {/* Meta */}
            <div className="space-y-1 text-muted-foreground text-xs">
              <div>
                Registered: <TimeAgo date={data.agent.created_at} />
              </div>
              <div>Heartbeat every {data.agent.heartbeat_interval_ms}ms</div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
