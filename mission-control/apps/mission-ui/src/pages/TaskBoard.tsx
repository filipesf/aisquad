import { useState, useCallback, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Task, TaskState } from '../types/domain.ts';
import { TASK_STATES } from '../types/domain.ts';
import { listTasks, changeTaskState, createTask } from '../lib/api.ts';
import { usePolling } from '../hooks/usePolling.ts';
import { StatusBadge } from '../components/StatusBadge.tsx';

const COLUMN_STYLES: Record<string, string> = {
  queued: 'border-t-blue-500',
  assigned: 'border-t-violet-500',
  in_progress: 'border-t-amber-500',
  review: 'border-t-cyan-500',
  done: 'border-t-emerald-500',
  blocked: 'border-t-red-500',
};

function TaskCard({ task }: { task: Task }) {
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', task.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const priorityLabel =
    task.priority >= 8
      ? 'text-red-400'
      : task.priority >= 5
        ? 'text-amber-400'
        : 'text-gray-500';

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="cursor-grab rounded-lg border border-gray-700 bg-gray-800 p-3 shadow-sm transition-all hover:border-gray-600 active:cursor-grabbing"
    >
      <Link to={`/tasks/${task.id}`} className="block">
        <p className="text-sm font-medium text-gray-100">{task.title}</p>
        <div className="mt-2 flex items-center justify-between">
          <span className={`text-xs font-mono ${priorityLabel}`}>P{task.priority}</span>
          <StatusBadge status={task.state} />
        </div>
      </Link>
    </div>
  );
}

function Column({
  state,
  tasks,
  onDrop,
}: {
  state: TaskState;
  tasks: Task[];
  onDrop: (taskId: string, newState: TaskState) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const taskId = e.dataTransfer.getData('text/plain');
    if (taskId) {
      onDrop(taskId, state);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex min-h-[200px] flex-col rounded-lg border border-gray-800 border-t-2 bg-gray-900/50 ${
        COLUMN_STYLES[state] ?? ''
      } ${dragOver ? 'ring-2 ring-blue-500/40' : ''}`}
    >
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
          {state.replace(/_/g, ' ')}
        </h3>
        <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">
          {tasks.length}
        </span>
      </div>
      <div className="flex-1 space-y-2 p-2">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}

function CreateTaskForm({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(5);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    try {
      await createTask({ title: title.trim(), description, priority });
      setTitle('');
      setDescription('');
      setPriority(5);
      setOpen(false);
      onCreated();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-gray-700 px-4 py-2 text-sm text-gray-400 transition-colors hover:border-gray-500 hover:text-gray-300"
      >
        + New Task
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-lg border border-gray-700 bg-gray-900 p-4"
    >
      <div className="space-y-3">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <label className="text-xs text-gray-400">Priority:</label>
          <input
            type="number"
            min={0}
            max={10}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value))}
            className="w-16 rounded-md border border-gray-700 bg-gray-800 px-2 py-1 text-sm text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-sm text-gray-400 transition-colors hover:text-gray-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function TaskBoard() {
  const { data: tasks, refresh } = usePolling(listTasks, 5000);
  const [error, setError] = useState<string | null>(null);

  const handleDrop = useCallback(
    async (taskId: string, newState: TaskState) => {
      setError(null);
      try {
        await changeTaskState(taskId, newState);
        refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to change task state';
        setError(message);
        // Clear error after 3s
        setTimeout(() => setError(null), 3000);
      }
    },
    [refresh],
  );

  const tasksByState = TASK_STATES.reduce<Record<string, Task[]>>((acc, state) => {
    acc[state] = tasks?.filter((t: Task) => t.state === state) ?? [];
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-100">Task Board</h2>
        <CreateTaskForm onCreated={refresh} />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-6 gap-3">
        {TASK_STATES.map((state) => (
          <Column
            key={state}
            state={state}
            tasks={tasksByState[state] ?? []}
            onDrop={(taskId, newState) => void handleDrop(taskId, newState)}
          />
        ))}
      </div>
    </div>
  );
}
