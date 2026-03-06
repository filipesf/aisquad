import { useEffect, useState, useRef } from 'react';
import type { Task, TaskWithAssignment, Assignment, Comment } from '@/types/domain';
import { TASK_STATES } from '@/types/domain';
import {
  getTask,
  getTaskAssignments,
  listComments,
  createComment,
  changeTaskState,
} from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { StatusBadge } from '@/components/StatusBadge';
import { priorityLabel } from './columns';
import { TimeAgo } from '@/components/TimeAgo';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SectionLabel } from '@/components/ui/SectionLabel';
import { MonoId } from '@/components/ui/MonoId';

interface TaskDetailSheetProps {
  task: Task | null;
  onClose: () => void;
}

interface TaskDetailData {
  task: TaskWithAssignment;
  assignments: Assignment[];
  comments: Comment[];
}

export function TaskDetailSheet({ task, onClose }: TaskDetailSheetProps) {
  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Tracks whether a success flash should be shown on the textarea
  const [commentPosted, setCommentPosted] = useState(false);
  const commentFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!task) {
      setData(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    function fetchAll() {
      if (!task) return;
      Promise.all([getTask(task.id), getTaskAssignments(task.id), listComments(task.id)])
        .then(([fullTask, assignments, comments]) => {
          if (!cancelled) {
            setData({ task: fullTask, assignments, comments });
            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Couldn't load task details");
            setLoading(false);
          }
        });
    }

    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [task]);

  async function handleStateChange(newState: string) {
    if (!data) return;
    try {
      await changeTaskState(data.task.id, newState as Task['state']);
    } catch {
      // state will refresh on next poll
    }
  }

  async function handleSubmitComment() {
    if (!data || !commentBody.trim()) return;
    setSubmitting(true);
    try {
      await createComment(data.task.id, 'dashboard', commentBody.trim());
      setCommentBody('');
      // Brief success feedback on the composer area
      setCommentPosted(true);
      if (commentFlashTimer.current) clearTimeout(commentFlashTimer.current);
      commentFlashTimer.current = setTimeout(() => setCommentPosted(false), 800);
    } catch {
      // silently ignore
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet
      open={!!task}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="mb-4">
          <SheetTitle>{data?.task.title ?? task?.title ?? 'Task'}</SheetTitle>
          <SheetDescription>{task ? <MonoId>{task.id}</MonoId> : null}</SheetDescription>
        </SheetHeader>

        {loading && !data && <p className="px-4 text-sm text-muted-foreground">Loading task…</p>}
        {error && <p className="px-4 text-sm text-destructive">{error}</p>}

        {data && (
          <div className="space-y-5 px-4 pb-6">
            {/* Status + priority row */}
            <div className="flex items-center gap-3 flex-wrap">
              <StatusBadge status={data.task.state} />
              <Badge variant="outline" className="text-xs capitalize">
                {priorityLabel(data.task.priority)}
              </Badge>
            </div>

            {/* State change */}
            <div>
              <SectionLabel id="state-label" className="mb-1.5">
                Change Status
              </SectionLabel>
              <Select defaultValue={data.task.state} onValueChange={handleStateChange}>
                <SelectTrigger className="w-[180px]" aria-labelledby="state-label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Description */}
            {data.task.description && (
              <div>
                <SectionLabel className="mb-1.5">Description</SectionLabel>
                <p className="text-sm whitespace-pre-wrap break-words">{data.task.description}</p>
              </div>
            )}

            {/* Current assignment */}
            {data.task.current_assignment && (
              <>
                <Separator />
                <div>
                  <SectionLabel className="mb-1.5">Current Assignment</SectionLabel>
                  <div className="flex items-center justify-between text-sm">
                    <MonoId slice={8}>{data.task.current_assignment.agent_id}</MonoId>
                    <StatusBadge status={data.task.current_assignment.status} />
                  </div>
                </div>
              </>
            )}

            {/* Assignment history */}
            {data.assignments.length > 0 && (
              <>
                <Separator />
                <div>
                  <SectionLabel>Assignment History ({data.assignments.length})</SectionLabel>
                  <ul className="space-y-2">
                    {data.assignments.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-sm">
                        <MonoId slice={8}>{a.agent_id}</MonoId>
                        <StatusBadge status={a.status} />
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            <Separator />

            {/* Comments */}
            <div>
              <SectionLabel>Comments ({data.comments.length})</SectionLabel>
              {data.comments.length > 0 ? (
                <ul className="space-y-3 mb-4">
                  {data.comments.map((c) => (
                    <li key={c.id} className="text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-xs">{c.author_id}</span>
                        <span className="text-xs text-muted-foreground">
                          <TimeAgo date={c.created_at} />
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-muted-foreground">{c.body}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground mb-4">No comments yet</p>
              )}

              {/* Comment composer */}
              <div className="space-y-2">
                {/* success-flash briefly pulses opacity after a comment posts */}
                <Textarea
                  placeholder="Write a comment…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  rows={3}
                  aria-label="Write a comment"
                  className={commentPosted ? 'animate-[success-flash_0.6s_ease-out_both]' : ''}
                />
                <Button
                  size="sm"
                  disabled={!commentBody.trim() || submitting}
                  onClick={handleSubmitComment}
                  className="active:scale-[0.97] transition-transform duration-[--dur-instant] min-w-[100px]"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      Posting…
                    </>
                  ) : (
                    'Post comment'
                  )}
                </Button>
              </div>
            </div>

            <Separator />

            {/* Meta */}
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                Created: <TimeAgo date={data.task.created_at} />
              </div>
              <div>
                Updated: <TimeAgo date={data.task.updated_at} />
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
