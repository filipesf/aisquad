import { Check, Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
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
import { createTask } from '@/lib/api';

interface CreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const PRIORITY_OPTIONS = [
  { label: 'Urgent', value: '10' },
  { label: 'High', value: '8' },
  { label: 'Medium', value: '5' },
  { label: 'Low', value: '2' }
];

export function CreateTaskDialog({ open, onOpenChange, onCreated }: CreateTaskDialogProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      await createTask({
        title: title.trim(),
        description: description.trim() || undefined,
        priority: parseInt(priority, 10)
      });
      // Brief success moment before closing — "Task deployed." for 700ms
      setSucceeded(true);
      onCreated();
      closeTimer.current = setTimeout(() => {
        setTitle('');
        setDescription('');
        setPriority('5');
        setSucceeded(false);
        onOpenChange(false);
      }, 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create task. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Clean up timer if dialog is dismissed manually mid-success
  function handleOpenChange(open: boolean) {
    if (!open && closeTimer.current) {
      clearTimeout(closeTimer.current);
      setSucceeded(false);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New task</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input
              id="task-title"
              placeholder="Enter a task title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              placeholder="Add a description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-priority">Priority</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger id="task-priority">
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

          {/* Error — animate-fade-up so it doesn't pop in jarringly */}
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
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={submitting || succeeded || !title.trim()}
              className="min-w-[110px] transition-transform duration-[--dur-instant] active:scale-[0.97]"
            >
              {succeeded ? (
                <span className="flex animate-task-done items-center gap-1.5">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Task deployed.
                </span>
              ) : submitting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Creating…
                </>
              ) : (
                'Create task'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
