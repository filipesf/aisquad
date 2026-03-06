import { Loader2, MessageSquareDashed, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfettiBurst } from '@/components/ConfettiBurst';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { MarkdownBody } from '@/components/ui/MarkdownBody';
import { MonoId } from '@/components/ui/MonoId';
import { SectionLabel } from '@/components/ui/SectionLabel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import {
  changeTaskState,
  createComment,
  deleteTask,
  getTask,
  getTaskAssignments,
  listComments
} from '@/lib/api';
import { formatDueDate } from '@/lib/dueDate';
import { cn } from '@/lib/utils';
import type { Assignment, Comment, Task, TaskWithAssignment } from '@/types/domain';
import { TASK_STATES } from '@/types/domain';
import { EditTaskDialog } from './EditTaskDialog';
import { priorityLabel } from './columns';

interface TaskDetailSheetProps {
  task: Task | null;
  onClose: () => void;
  onUpdated?: () => void;
}

interface TaskDetailData {
  task: TaskWithAssignment;
  assignments: Assignment[];
  comments: Comment[];
}

export function TaskDetailSheet({ task, onClose, onUpdated }: TaskDetailSheetProps) {
  const [data, setData] = useState<TaskDetailData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Tracks whether a success flash should be shown on the textarea
  const [commentPosted, setCommentPosted] = useState(false);
  const commentFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks newly-arrived comments for landing animation
  const [newCommentIds, setNewCommentIds] = useState<Set<string>>(new Set());
  const prevCommentIdsRef = useRef<Set<string>>(new Set());
  // Tracks state change micro-pop
  const [stateChangePop, setStateChangePop] = useState(false);
  const statePopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks confetti burst when a task reaches "done"
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Edit / delete dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const { toast } = useToast();

  // Must be declared before the useEffect that calls it
  const trackNewComments = useCallback((comments: Comment[]) => {
    const currentIds = new Set(comments.map((c) => c.id));
    const added = comments
      .filter((c) => !prevCommentIdsRef.current.has(c.id) && prevCommentIdsRef.current.size > 0)
      .map((c) => c.id);
    if (added.length > 0) {
      setNewCommentIds(new Set(added));
      setTimeout(() => setNewCommentIds(new Set()), 500);
    }
    prevCommentIdsRef.current = currentIds;
  }, []);

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
            trackNewComments(comments);
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
  }, [task, trackNewComments]);

  async function handleStateChange(newState: string) {
    if (!data) return;
    // Micro-pop on the status badge to confirm the switch landed
    setStateChangePop(true);
    if (statePopTimer.current) clearTimeout(statePopTimer.current);
    statePopTimer.current = setTimeout(() => setStateChangePop(false), 300);
    try {
      await changeTaskState(data.task.id, newState as Task['state']);
      // Milestone: task reached "done" — confetti burst + toast
      if (newState === 'done') {
        setShowConfetti(true);
        if (confettiTimer.current) clearTimeout(confettiTimer.current);
        confettiTimer.current = setTimeout(() => setShowConfetti(false), 900);
        toast({
          title: 'Task complete.',
          description: 'Good work. One fewer thing to worry about.',
          variant: 'success',
          duration: 4000
        });
      }
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

  async function handleDeleteConfirm() {
    if (!data) return;
    setDeleting(true);
    try {
      await deleteTask(data.task.id);
      setDeleteOpen(false);
      onClose();
      onUpdated?.();
      toast({ title: 'Task deleted.', duration: 3000 });
    } catch {
      toast({ title: 'Delete failed. Please try again.', variant: 'destructive', duration: 4000 });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Sheet
        open={!!task}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader className="mb-4 pr-10">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <SheetTitle>{data?.task.title ?? task?.title ?? 'Task'}</SheetTitle>
                <SheetDescription>{task ? <MonoId>{task.id}</MonoId> : null}</SheetDescription>
              </div>
              {data && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 h-7 w-7 shrink-0"
                      aria-label="Task actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </SheetHeader>

          {loading && !data && <p className="px-4 text-muted-foreground text-sm">Loading task…</p>}
          {error && <p className="px-4 text-destructive text-sm">{error}</p>}

          {data && (
            <div className="space-y-5 px-4 pb-6">
              {/* Status + priority row */}
              {/* stateChangePop key forces remount → replays animate-state-change-pop */}
              <div className="flex flex-wrap items-center gap-3">
                <span
                  key={stateChangePop ? 'pop' : 'idle'}
                  className={cn(
                    'relative inline-flex',
                    stateChangePop ? 'animate-state-change-pop' : ''
                  )}
                >
                  <StatusBadge status={data.task.state} />
                  {/* Confetti burst — mounts for 900ms when task reaches "done" */}
                  {showConfetti && <ConfettiBurst />}
                </span>
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
                  <MarkdownBody className="text-foreground">{data.task.description}</MarkdownBody>
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
                  <ul className="mb-4 space-y-3">
                    {data.comments.map((c) => (
                      <li
                        key={c.id}
                        className={cn('text-sm', newCommentIds.has(c.id) && 'animate-comment-land')}
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-medium text-xs">{c.author_id}</span>
                          <span className="text-muted-foreground text-xs">
                            <TimeAgo date={c.created_at} />
                          </span>
                        </div>
                        <MarkdownBody className="text-muted-foreground">{c.body}</MarkdownBody>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="mb-4 flex items-center gap-2 text-muted-foreground text-sm">
                    <MessageSquareDashed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Quiet so far. Agents are working silently.</span>
                  </div>
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
                    className="min-w-[100px] transition-transform duration-[--dur-instant] active:scale-[0.97]"
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
              <div className="space-y-1 text-muted-foreground text-xs">
                {(() => {
                  const fmt = formatDueDate(data.task.due_date);
                  if (!fmt) return null;
                  return (
                    <div className={fmt.isOverdue ? 'text-destructive' : undefined}>
                      Due: {fmt.absolute}
                      <span className="ml-1.5 opacity-70">· {fmt.relative}</span>
                    </div>
                  );
                })()}
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

      {/* Edit dialog — mounted outside Sheet to avoid stacking context issues */}
      <EditTaskDialog
        task={editOpen ? (data?.task ?? null) : null}
        onOpenChange={(open) => {
          if (!open) setEditOpen(false);
        }}
        onUpdated={() => {
          setEditOpen(false);
          onUpdated?.();
        }}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!open) setDeleteOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              <strong>&ldquo;{data?.task.title}&rdquo;</strong> will be permanently deleted. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="transition-transform duration-[--dur-instant] active:scale-[0.97]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={handleDeleteConfirm}
              className="min-w-[90px] transition-transform duration-[--dur-instant] active:scale-[0.97]"
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  Deleting…
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
