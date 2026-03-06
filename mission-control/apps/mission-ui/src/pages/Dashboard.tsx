import { useMemo, useState, useEffect } from 'react';
import type { Agent } from '@/types/domain';
import { listAgents, listTasks } from '@/lib/api';
import { usePolling } from '@/hooks/usePolling';
import { useActivityStream } from '@/hooks/useActivityStream';
import { ApiAuthBanner } from '@/components/ApiAuthBanner';
import { WelcomeBanner } from '@/components/WelcomeBanner';
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

  // Controlled create-task dialog — lifted here so keyboard shortcut N can open it
  const [createOpen, setCreateOpen] = useState(false);

  // Keyboard shortcut: press N to open new-task dialog (when no input/textarea is focused)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if focus is inside a form field or the dialog is already open
      const tag = (e.target as HTMLElement).tagName;
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement).isContentEditable;
      if (isEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setCreateOpen(true);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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

      {/* First-visit welcome — stagger index 0. Hidden once dismissed. */}
      <WelcomeBanner />

      {/* Fleet — stagger index 1 */}
      <section className="animate-fade-up" style={{ '--stagger-i': 1 } as React.CSSProperties}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
            Agents
          </h2>
          <span className="text-xs text-muted-foreground">
            {onlineCount} of {totalAgents} online
          </span>
        </div>
        <AgentsTable agents={agents ?? []} />
      </section>

      {/* Tasks — stagger index 2 */}
      <section className="animate-fade-up" style={{ '--stagger-i': 2 } as React.CSSProperties}>
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight">
          <span className="block h-3.5 w-0.5 rounded-full bg-primary" aria-hidden="true" />
          Tasks
        </h2>
        <TasksTable
          tasks={tasks ?? []}
          onRefresh={refreshTasks}
          createOpen={createOpen}
          onCreateOpenChange={setCreateOpen}
        />
      </section>

      {/* Activity feed — stagger index 3 */}
      <div className="animate-fade-up" style={{ '--stagger-i': 3 } as React.CSSProperties}>
        <ActivityFeed activities={activities} connected={connected} maxHeight="400px" />
      </div>
    </div>
  );
}
