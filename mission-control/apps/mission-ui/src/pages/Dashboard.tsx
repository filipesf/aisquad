import type { Agent, Task } from '@/types/domain';
import { TASK_STATES } from '@/types/domain';
import { listAgents, listTasks } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import { useActivityStream } from '@/hooks/useActivityStream';
import { ApiAuthBanner } from '@/components/ApiAuthBanner';
import { ActivityFeed } from '@/components/ActivityFeed';
import { AgentsTable } from '@/components/agents/AgentsTable';
import { TasksTable } from '@/components/tasks/TasksTable';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function StatCard({ label, count }: { label: string; count: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium capitalize text-muted-foreground">
          {label.replace(/_/g, ' ')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count}</div>
      </CardContent>
    </Card>
  );
}

export function Dashboard() {
  const { data: agents, error: agentsError, refresh: refreshAgents } = usePolling(listAgents, 5000);
  const { data: tasks, error: tasksError, refresh: refreshTasks } = usePolling(listTasks, 5000);
  const { activities, connected } = useActivityStream();

  const stateCounts = TASK_STATES.reduce<Record<string, number>>((acc, state) => {
    acc[state] = tasks?.filter((t: Task) => t.state === state).length ?? 0;
    return acc;
  }, {});

  const onlineCount = agents?.filter((a: Agent) => a.status === 'online').length ?? 0;
  const totalAgents = agents?.length ?? 0;

  return (
    <div className="p-6 space-y-8">
      <ApiAuthBanner error={tasksError ?? agentsError} />

      {/* Fleet */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Fleet</h2>
          <span className="text-sm text-muted-foreground">
            {onlineCount}/{totalAgents} online
          </span>
        </div>
        <AgentsTable agents={agents ?? []} />
      </section>

      {/* Task state stats */}
      <section>
        <h2 className="mb-4 text-base font-semibold">Tasks Overview</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {TASK_STATES.map((state) => (
            <StatCard key={state} label={state} count={stateCounts[state] ?? 0} />
          ))}
        </div>
      </section>

      {/* Tasks table */}
      <section>
        <h2 className="mb-4 text-base font-semibold">Tasks</h2>
        <TasksTable tasks={tasks ?? []} onRefresh={refreshTasks} />
      </section>

      {/* Activity feed */}
      <section>
        <ActivityFeed activities={activities} connected={connected} maxHeight="400px" />
      </section>
    </div>
  );
}
