import { useMemo } from 'react';
import type { Agent } from '@/types/domain';
import { listAgents, listTasks } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import { useActivityStream } from '@/hooks/useActivityStream';
import { ApiAuthBanner } from '@/components/ApiAuthBanner';
import { ActivityFeed } from '@/components/ActivityFeed';
import { AgentsTable } from '@/components/agents/AgentsTable';
import { TasksTable } from '@/components/tasks/TasksTable';

export function Dashboard() {
  const {
    data: agents,
    error: agentsError,
    refresh: _refreshAgents,
  } = usePolling(listAgents, 5000);
  const { data: tasks, error: tasksError, refresh: refreshTasks } = usePolling(listTasks, 5000);
  const { activities, connected } = useActivityStream();

  // Memoize agent count calculations
  const { onlineCount, totalAgents } = useMemo(
    () => ({
      onlineCount: agents?.filter((a: Agent) => a.status === 'online').length ?? 0,
      totalAgents: agents?.length ?? 0,
    }),
    [agents],
  );

  return (
    <div className="p-6 space-y-8">
      <ApiAuthBanner error={tasksError ?? agentsError} />

      {/* Fleet — stagger index 0 */}
      <section className="animate-fade-up" style={{ '--stagger-i': 0 } as React.CSSProperties}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Agents</h2>
          <span className="text-xs text-muted-foreground">
            {onlineCount} of {totalAgents} online
          </span>
        </div>
        <AgentsTable agents={agents ?? []} />
      </section>

      {/* Tasks — stagger index 1 */}
      <section className="animate-fade-up" style={{ '--stagger-i': 1 } as React.CSSProperties}>
        <h2 className="mb-4 text-sm font-semibold tracking-tight">Tasks</h2>
        <TasksTable tasks={tasks ?? []} onRefresh={refreshTasks} />
      </section>

      {/* Activity feed — stagger index 2 */}
      <div className="animate-fade-up" style={{ '--stagger-i': 2 } as React.CSSProperties}>
        <ActivityFeed activities={activities} connected={connected} maxHeight="400px" />
      </div>
    </div>
  );
}
