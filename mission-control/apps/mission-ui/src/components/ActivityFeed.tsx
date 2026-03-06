import { useRef, memo } from 'react';
import type { Activity } from '@/types/domain';
import { TimeAgo } from './TimeAgo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
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
      return `Task created: ${String(p['title'] ?? '')}`;
    case 'task.state_changed':
      return `Task state: ${String(p['from'] ?? '?')} → ${String(p['to'] ?? '?')}`;
    case 'task.requeued':
      return 'Task requeued';
    case 'assignment.offered':
      return 'Assignment offered';
    case 'assignment.accepted':
      return 'Assignment accepted';
    case 'assignment.completed':
      return 'Assignment completed';
    case 'assignment.expired':
      return 'Assignment expired (lease timeout)';
    case 'comment.created':
      return 'Comment posted';
    default:
      return activity.type;
  }
}

/**
 * Memoized — only re-renders when activities array or connected status changes.
 * SSE events push new items into the array, so identity changes are intentional.
 */
export const ActivityFeed = memo(function ActivityFeed({
  activities,
  connected,
  maxHeight = '400px',
}: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Activity Feed</CardTitle>
        <div className="flex items-center gap-2">
          <div
            className={cn('h-2 w-2 rounded-full', connected ? 'bg-emerald-500' : 'bg-red-500')}
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground" role="status" aria-live="polite">
            {connected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ height: maxHeight }} ref={scrollRef}>
          {activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <Bell className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">No activities yet</p>
            </div>
          ) : (
            <ul className="divide-y" aria-live="polite" aria-atomic="false">
              {activities.map((activity) => {
                const { icon: Icon, colour } = getActivityMeta(activity.type);
                return (
                  <li
                    key={activity.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
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
      </CardContent>
    </Card>
  );
});
