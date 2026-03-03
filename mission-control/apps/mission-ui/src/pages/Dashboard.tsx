import { Link } from 'react-router-dom';
import type { Agent, Task } from '../types/domain.ts';
import { TASK_STATES } from '../types/domain.ts';
import { listAgents, listTasks } from '../lib/api.ts';
import { usePolling } from '../hooks/usePolling.ts';
import { useActivityStream } from '../hooks/useActivityStream.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';
import { TimeAgo } from '../components/TimeAgo.tsx';
import { ActivityFeed } from '../components/ActivityFeed.tsx';

function AgentCard({ agent }: { agent: Agent }) {
  return (
    <Link
      to={`/agents/${agent.id}`}
      className="block rounded-lg border border-gray-800 bg-gray-900 p-4 transition-colors hover:border-gray-700"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-medium text-gray-100">{agent.name}</h3>
        <StatusBadge status={agent.status} />
      </div>
      <div className="mt-2 text-xs text-gray-500">
        Last seen: <TimeAgo date={agent.last_seen_at} />
      </div>
    </Link>
  );
}

function StatCounter({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className={`text-2xl font-bold ${color}`}>{count}</div>
      <div className="mt-1 text-xs capitalize text-gray-400">{label.replace(/_/g, ' ')}</div>
    </div>
  );
}

const STATE_COLORS: Record<string, string> = {
  queued: 'text-blue-400',
  assigned: 'text-violet-400',
  in_progress: 'text-amber-400',
  review: 'text-cyan-400',
  done: 'text-emerald-400',
  blocked: 'text-red-400',
};

export function Dashboard() {
  const { data: agents } = usePolling(listAgents, 5000);
  const { data: tasks } = usePolling(listTasks, 5000);
  const { activities, connected } = useActivityStream();

  const stateCounts = TASK_STATES.reduce<Record<string, number>>((acc, state) => {
    acc[state] = tasks?.filter((t: Task) => t.state === state).length ?? 0;
    return acc;
  }, {});

  const onlineCount = agents?.filter((a: Agent) => a.status === 'online').length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div className="space-y-8">
      {/* Fleet Summary */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-100">Fleet Status</h2>
          <span className="text-sm text-gray-400">
            {onlineCount}/{totalAgents} online
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents?.map((agent: Agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
          {agents?.length === 0 && (
            <p className="text-sm text-gray-500">No agents registered</p>
          )}
        </div>
      </section>

      {/* Task State Counters */}
      <section>
        <h2 className="mb-4 text-lg font-semibold text-gray-100">Tasks Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TASK_STATES.map((state) => (
            <StatCounter
              key={state}
              label={state}
              count={stateCounts[state] ?? 0}
              color={STATE_COLORS[state] ?? 'text-gray-400'}
            />
          ))}
        </div>
      </section>

      {/* Activity Feed */}
      <section>
        <ActivityFeed activities={activities} connected={connected} maxHeight="400px" />
      </section>
    </div>
  );
}
