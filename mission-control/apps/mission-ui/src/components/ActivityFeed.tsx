import { useRef, useEffect, useState, memo } from 'react';
import type { Activity } from '@/types/domain';
import { TimeAgo } from './TimeAgo';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TableShell } from '@/components/ui/TableShell';
import { cn } from '@/lib/utils';
import {
  CircleDot,
  CircleOff,
  ClipboardList,
  RefreshCw,
  RotateCcw,
  Send,
  CheckCircle2,
  Flag,
  Clock,
  MessageSquare,
  Bell,
  Pin,
} from 'lucide-react';

interface ActivityFeedProps {
  activities: Activity[];
  connected: boolean;
  maxHeight?: string;
}

interface ActivityMeta {
  icon: React.ElementType;
  colour: string;
}

const ACTIVITY_META: Record<string, ActivityMeta> = {
  'agent.online': { icon: CircleDot, colour: 'text-emerald-500' },
  'agent.offline': { icon: CircleOff, colour: 'text-muted-foreground' },
  'task.created': { icon: ClipboardList, colour: 'text-blue-500' },
  'task.state_changed': { icon: RefreshCw, colour: 'text-amber-500' },
  'task.requeued': { icon: RotateCcw, colour: 'text-amber-500' },
  'assignment.offered': { icon: Send, colour: 'text-blue-500' },
  'assignment.accepted': { icon: CheckCircle2, colour: 'text-emerald-500' },
  'assignment.completed': { icon: Flag, colour: 'text-muted-foreground' },
  'assignment.expired': { icon: Clock, colour: 'text-red-500' },
  'comment.created': { icon: MessageSquare, colour: 'text-foreground' },
  'notification.dispatched': { icon: Bell, colour: 'text-foreground' },
};

const FALLBACK_META: ActivityMeta = { icon: Pin, colour: 'text-muted-foreground' };

function getActivityMeta(type: string): ActivityMeta {
  return ACTIVITY_META[type] ?? FALLBACK_META;
}

function getActivityDescription(activity: Activity): string {
  const p = activity.payload;

  switch (activity.type) {
    case 'agent.online':
      return 'Agent came online';
    case 'agent.offline':
      return 'Agent went offline';
    case 'task.created':
      return `New task: ${String(p['title'] ?? '')}`;
    case 'task.state_changed':
      return `Status changed: ${String(p['from'] ?? '?')} → ${String(p['to'] ?? '?')}`;
    case 'task.requeued':
      return 'Task returned to queue';
    case 'assignment.offered':
      return 'Task assigned to agent';
    case 'assignment.accepted':
      return 'Agent accepted task';
    case 'assignment.completed':
      return 'Agent completed task';
    case 'assignment.expired':
      return 'Assignment timed out';
    case 'comment.created':
      return 'New comment added';
    default:
      return activity.type;
  }
}

/**
 * Memoized — only re-renders when activities array or connected status changes.
 * SSE events push new items into the array, so identity changes are intentional.
 *
 * Animation strategy:
 * - New items (first N since last render) slide in from above with fade
 * - The live/reconnecting dot pulses continuously when connected
 * - Tracked via a ref to avoid stale-closure issues in the memoized component
 */
export const ActivityFeed = memo(function ActivityFeed({
  activities,
  connected,
  maxHeight = '400px',
}: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Track which activity IDs are "new" (i.e., appeared since the last render)
  // so we can play their entrance animation only once.
  const prevIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(activities.map((a) => a.id));
    const added = activities.filter((a) => !prevIdsRef.current.has(a.id)).map((a) => a.id);

    if (added.length > 0) {
      setNewIds(new Set(added));
      // Clear "new" flag after the animation completes so re-mounts don't re-animate
      const timer = setTimeout(() => setNewIds(new Set()), 400);
      return () => clearTimeout(timer);
    }

    prevIdsRef.current = currentIds;
  }, [activities]);

  // Keep prevIdsRef in sync after new IDs are recorded
  useEffect(() => {
    prevIdsRef.current = new Set(activities.map((a) => a.id));
  }, [activities]);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
          Activity
        </h2>
        <div className="flex items-center gap-2">
          {/* Live dot: pulses when connected, stays static red when disconnected */}
          <div
            className={cn(
              'h-2 w-2 rounded-full transition-colors',
              connected ? 'bg-emerald-500 animate-live-pulse' : 'bg-red-500',
            )}
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
      </div>

      <TableShell>
        <ScrollArea style={{ height: maxHeight }} ref={scrollRef}>
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center animate-fade-up">
              <Bell className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                No activity yet. Events will appear here as agents work.
              </p>
            </div>
          ) : (
            <ul className="divide-y" aria-live="polite" aria-atomic="false">
              {activities.map((activity) => {
                const { icon: Icon, colour } = getActivityMeta(activity.type);
                const isNew = newIds.has(activity.id);
                return (
                  <li
                    key={activity.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 hover:bg-muted/30',
                      'transition-colors duration-[--dur-fast]',
                      isNew && 'animate-activity-enter',
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', colour)} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm break-words">{getActivityDescription(activity)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <TimeAgo date={activity.created_at} />
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </TableShell>
    </div>
  );
});
