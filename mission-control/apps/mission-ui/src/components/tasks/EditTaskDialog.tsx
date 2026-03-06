import { Check, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { updateTask } from '@/lib/api';
import { fromDateInputValue, toDateInputValue } from '@/lib/dueDate';
import type { Task } from '@/types/domain';

interface EditTaskDialogProps {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (task: Task) => void;
}

const PRIORITY_OPTIONS = [
  { label: 'Urgent', value: '10' },
  { label: 'High', value: '8' },
  { label: 'Medium', value: '5' },
  { label: 'Low', value: '2' }
];

function priorityToValue(priority: number): string {
  if (priority >= 10) return '10';
  if (priority >= 8) return '8';
  if (priority >= 5) return '5';
  return '2';
}

export function EditTaskDialog({ task, onOpenChange, onUpdated }: EditTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('5');
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync form fields when task changes (dialog opens with a different task)
  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(priorityToValue(task.priority));
      setDueDate(toDateInputValue(task.due_date));
      setError(null);
      setSucceeded(false);
    }
  }, [task]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!task || !title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const updated = await updateTask(task.id, {
        title: title.trim(),
        description: description.trim(),
        priority: parseInt(priority, 10),
        due_date: fromDateInputValue(dueDate)
      });
      setSucceeded(true);
      onUpdated(updated);
      closeTimer.current = setTimeout(() => {
        setSucceeded(false);
        onOpenChange(false);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleOpenChange(open: boolean) {
    if (!open) {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        setSucceeded(false);
      }
      // Reset to task values on cancel
      if (task) {
        setTitle(task.title);
        setDescription(task.description);
        setPriority(priorityToValue(task.priority));
        setDueDate(toDateInputValue(task.due_date));
      }
      setError(null);
    }
    onOpenChange(open);
  }

  const isDirty =
    task &&
    (title.trim() !== task.title ||
      description.trim() !== task.description ||
      parseInt(priority, 10) !== task.priority ||
      // Compare at YYYY-MM-DD granularity to avoid ISO timezone drift false-positives
      dueDate !== toDateInputValue(task.due_date));

  return (
    <Dialog open={!!task} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-task-title">Title</Label>
            <Input
              id="edit-task-title"
              placeholder="Task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-task-description">Description</Label>
            <Textarea
              id="edit-task-description"
              placeholder="Add a description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-task-priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="edit-task-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-task-due-date">
              Due date{' '}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <input
              id="edit-task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {error && (
            <p
              className="animate-fade-up text-destructive text-sm"
              style={{ '--stagger-i': 0 } as React.CSSProperties}
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="transition-transform duration-[--dur-instant] active:scale-[0.97]"
              onClick={() => handleOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || succeeded || !title.trim() || !isDirty}
              className="min-w-[110px] transition-transform duration-[--dur-instant] active:scale-[0.97]"
            >
              {succeeded ? (
                <span className="flex animate-task-done items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Saved.
                </span>
              ) : submitting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
