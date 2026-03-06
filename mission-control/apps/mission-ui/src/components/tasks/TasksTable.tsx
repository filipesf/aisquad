import {
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable
} from '@tanstack/react-table';
import { Check, ClipboardList, Loader2, PlusCircle, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { TableShell } from '@/components/ui/TableShell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useToast } from '@/hooks/useToast';
import { deleteTask } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';
import { TASK_STATES } from '@/types/domain';
import { CreateTaskDialog } from './CreateTaskDialog';
import { EditTaskDialog } from './EditTaskDialog';
import { getTaskColumns } from './columns';
import { TaskDetailSheet } from './TaskDetailSheet';

const PRIORITY_OPTIONS = ['Urgent', 'High', 'Medium', 'Low'];

interface TasksTableProps {
  tasks: Task[];
  onRefresh: () => void;
  /** Controlled create-dialog state — set from Dashboard for keyboard shortcut N */
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}

export function TasksTable({
  tasks,
  onRefresh,
  createOpen: externalCreateOpen,
  onCreateOpenChange
}: TasksTableProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { toast } = useToast();

  // Support both controlled (keyboard shortcut from parent) and uncontrolled usage
  const createOpen = externalCreateOpen ?? internalCreateOpen;
  const setCreateOpen = onCreateOpenChange ?? setInternalCreateOpen;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const columns = useMemo(
    () =>
      getTaskColumns({
        onEdit: setEditTask,
        onDelete: setDeleteTarget
      }),
    [] // setEditTask / setDeleteTarget are stable setState refs
  );

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } }
  });

  const statusFilter = (table.getColumn('state')?.getFilterValue() as string[]) ?? [];
  const priorityFilter = (table.getColumn('priority')?.getFilterValue() as string[]) ?? [];

  function toggleFilter(column: 'state' | 'priority', value: string) {
    const col = table.getColumn(column);
    const current = (col?.getFilterValue() as string[] | undefined) ?? [];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    col?.setFilterValue(next.length > 0 ? next : undefined);
  }

  const hasFilters = statusFilter.length > 0 || priorityFilter.length > 0;

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTask(deleteTarget.id);
      // If the deleted task is currently open in the detail sheet, close it
      if (selectedTask?.id === deleteTarget.id) {
        setSelectedTask(null);
      }
      setDeleteTarget(null);
      onRefresh();
      toast({ title: 'Task deleted.', duration: 3000 });
    } catch {
      toast({ title: 'Delete failed. Please try again.', variant: 'destructive', duration: 4000 });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search by title…"
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(e) => table.getColumn('title')?.setFilterValue(e.target.value)}
          className="h-8 min-w-50 text-sm"
          aria-label="Search tasks by title…"
        />

        {/* Status filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              aria-label="Filter by status"
            >
              Status
              {statusFilter.length > 0 && (
                <>
                  <Separator orientation="vertical" className="mx-1.5 h-4" />
                  {/* animate-badge-pop replays on each count change via key */}
                  <Badge
                    key={statusFilter.length}
                    variant="secondary"
                    className="animate-badge-pop rounded px-1 font-normal text-xs"
                  >
                    {statusFilter.length}
                  </Badge>
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="min-w-40 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Search statuses…"
                className="h-8"
                aria-label="Search statuses"
              />
              <CommandList>
                <CommandEmpty>No matching statuses</CommandEmpty>
                <CommandGroup>
                  {TASK_STATES.map((state) => (
                    <CommandItem key={state} onSelect={() => toggleFilter('state', state)}>
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          statusFilter.includes(state) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="capitalize">{state.replace(/_/g, ' ')}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                {statusFilter.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => table.getColumn('state')?.setFilterValue(undefined)}
                        className="justify-center text-center text-xs"
                      >
                        Clear filters
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Priority filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              aria-label="Filter by priority"
            >
              Priority
              {priorityFilter.length > 0 && (
                <>
                  <Separator orientation="vertical" className="mx-1.5 h-4" />
                  <Badge
                    key={priorityFilter.length}
                    variant="secondary"
                    className="animate-badge-pop rounded px-1 font-normal text-xs"
                  >
                    {priorityFilter.length}
                  </Badge>
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="min-w-35 p-0" align="start">
            <Command>
              <CommandList>
                <CommandGroup>
                  {PRIORITY_OPTIONS.map((p) => (
                    <CommandItem key={p} onSelect={() => toggleFilter('priority', p)}>
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          priorityFilter.includes(p) ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {p}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {priorityFilter.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={() => table.getColumn('priority')?.setFilterValue(undefined)}
                        className="justify-center text-center text-xs"
                      >
                        Clear filters
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Reset all filters — fades in when any filter is active */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 animate-badge-pop px-2 text-xs"
            onClick={() => {
              table.getColumn('state')?.setFilterValue(undefined);
              table.getColumn('priority')?.setFilterValue(undefined);
            }}
          >
            Clear all <X className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}

        {/* New task — keyboard shortcut N */}
        <div className="ml-auto flex items-center gap-1.5">
          <kbd
            className="hidden select-none items-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex"
            title="Keyboard shortcut"
            aria-label="Keyboard shortcut: N"
          >
            N
          </kbd>
          <Button
            size="sm"
            className="h-8 text-xs transition-transform duration-[--dur-instant] active:scale-[0.97]"
            onClick={() => setCreateOpen(true)}
          >
            <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
            New task
          </Button>
        </div>
      </div>

      {/* Table */}
      <TableShell>
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer transition-colors duration-[--dur-instant] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:bg-muted/60"
                  onClick={() => setSelectedTask(row.original)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedTask(row.original);
                    }
                  }}
                  aria-label={`View details for task: ${row.original.title}`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="min-w-0">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  {hasFilters ? (
                    <EmptyState
                      icon={ClipboardList}
                      message="No tasks match your filters"
                      description="Try adjusting the status or priority filters, or clear them to see all tasks."
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => {
                            table.getColumn('state')?.setFilterValue(undefined);
                            table.getColumn('priority')?.setFilterValue(undefined);
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={ClipboardList}
                      message="No tasks yet"
                      description="Tasks move through a state machine — from queued through assigned, in progress, review, and done. Create your first task to get started."
                      action={
                        <Button size="sm" className="text-xs" onClick={() => setCreateOpen(true)}>
                          <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
                          Create first task
                        </Button>
                      }
                    />
                  )}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableShell>

      {/* Pagination */}
      <div className="mt-3 flex items-center justify-between text-muted-foreground text-xs">
        <span aria-live="polite" aria-atomic="true">
          {table.getFilteredRowModel().rows.length} task
          {table.getFilteredRowModel().rows.length !== 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <span className="px-2">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      <TaskDetailSheet
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdated={onRefresh}
      />

      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onRefresh} />

      <EditTaskDialog
        task={editTask}
        onOpenChange={(open) => {
          if (!open) setEditTask(null);
        }}
        onUpdated={() => {
          setEditTask(null);
          onRefresh();
        }}
      />

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              <strong>&ldquo;{deleteTarget?.title}&rdquo;</strong> will be permanently deleted. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
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
