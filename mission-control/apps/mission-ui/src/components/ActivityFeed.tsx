import { useRef } from 'react';
import type { Activity } from '../types/domain.ts';
import { TimeAgo } from './TimeAgo.tsx';

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
      return `Agent came online`;
    case 'agent.offline':
      return `Agent went offline`;
    case 'task.created':
      return `Task created: ${String(p['title'] ?? '')}`;
    case 'task.state_changed':
      return `Task state: ${String(p['from'] ?? '?')} → ${String(p['to'] ?? '?')}`;
    case 'task.requeued':
      return `Task requeued`;
    case 'assignment.offered':
      return `Assignment offered`;
    case 'assignment.accepted':
      return `Assignment accepted`;
    case 'assignment.completed':
      return `Assignment completed`;
    case 'assignment.expired':
      return `Assignment expired (lease timeout)`;
    case 'comment.created':
      return `Comment posted`;
    default:
      return activity.type;
  }
}

export function ActivityFeed({ activities, connected, maxHeight = '600px' }: ActivityFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-800 px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-200">Activity Feed</h3>
        <div className="flex items-center gap-2">
          <div
            className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`}
            title={connected ? 'Connected' : 'Disconnected'}
          />
          <span className="text-xs text-gray-500">
            {connected ? 'Live' : 'Reconnecting...'}
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="overflow-y-auto"
        style={{ maxHeight }}
      >
        {activities.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">No activities yet</div>
        ) : (
          <ul className="divide-y divide-gray-800/50">
            {activities.map((activity) => (
              <li
                key={activity.id}
                className="flex items-start gap-3 px-4 py-3 hover:bg-gray-800/30"
              >
                <span className="mt-0.5 text-base leading-none">
                  {getActivityIcon(activity.type)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-300">
                    {getActivityDescription(activity)}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    <TimeAgo date={activity.created_at} />
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
