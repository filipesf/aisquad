import { useRef } from 'react';
import type { Activity } from '@/types/domain';
import { TimeAgo } from './TimeAgo';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ActivityFeedProps {
  activities: Activity[];
  connected: boolean;
  maxHeight?: string;
}

const ACTIVITY_ICONS: Record<string, string> = {
  'agent.online': '🟢',
  'agent.offline': '🔴',
  'task.created': '📋',
  'task.state_changed': '🔄',
  'task.requeued': '↩️',
  'assignment.offered': '📨',
  'assignment.accepted': '✅',
  'assignment.completed': '🏁',
  'assignment.expired': '⏰',
  'comment.created': '💬',
  'notification.dispatched': '🔔',
};

function getActivityIcon(type: string): string {
  return ACTIVITY_ICONS[type] ?? '📌';
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

export function ActivityFeed({ activities, connected, maxHeight = '400px' }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Activity Feed</CardTitle>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'h-2 w-2 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-red-500',
            )}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-xs text-muted-foreground">
            {connected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea style={{ height: maxHeight }} ref={scrollRef}>
          {activities.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">No activities yet</div>
          ) : (
            <ul className="divide-y">
              {activities.map((activity) => (
                <li
                  key={activity.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30"
                >
                  <span className="mt-0.5 text-base leading-none">
                    {getActivityIcon(activity.type)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{getActivityDescription(activity)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <TimeAgo date={activity.created_at} />
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
