import { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState,
} from '@tanstack/react-table';
import type { Task } from '@/types/domain';
import { TASK_STATES } from '@/types/domain';
import { getTaskColumns } from './columns';
import { TaskDetailSheet } from './TaskDetailSheet';
import { CreateTaskDialog } from './CreateTaskDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import { Badge } from '@/components/ui/badge';
import { Check, ChevronDown, PlusCircle, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Separator } from '@/components/ui/separator';

const PRIORITY_OPTIONS = ['Urgent', 'High', 'Medium', 'Low'];

interface TasksTableProps {
  tasks: Task[];
  onRefresh: () => void;
}

export function TasksTable({ tasks, onRefresh }: TasksTableProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const columns = useMemo(() => getTaskColumns(), []);

  const table = useReactTable({
    data: tasks,
    columns,
    state: { sorting, columnFilters, columnVisibility },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 20 } },
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

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <Input
          placeholder="Search tasks…"
          value={(table.getColumn('title')?.getFilterValue() as string) ?? ''}
          onChange={(e) => table.getColumn('title')?.setFilterValue(e.target.value)}
          className="h-8 min-w-[200px] text-sm"
          aria-label="Search tasks by title"
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
                  <Badge variant="secondary" className="rounded px-1 text-xs font-normal">
                    {statusFilter.length}
                  </Badge>
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="min-w-[160px] p-0" align="start">
            <Command>
              <CommandInput
                placeholder="Filter…"
                className="h-8"
                aria-label="Search status options"
              />
              <CommandList>
                <CommandEmpty>No results</CommandEmpty>
                <CommandGroup>
                  {TASK_STATES.map((state) => (
                    <CommandItem key={state} onSelect={() => toggleFilter('state', state)}>
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          statusFilter.includes(state) ? 'opacity-100' : 'opacity-0',
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
                  <Badge variant="secondary" className="rounded px-1 text-xs font-normal">
                    {priorityFilter.length}
                  </Badge>
                </>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="min-w-[140px] p-0" align="start">
            <Command>
              <CommandList>
                <CommandGroup>
                  {PRIORITY_OPTIONS.map((p) => (
                    <CommandItem key={p} onSelect={() => toggleFilter('priority', p)}>
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          priorityFilter.includes(p) ? 'opacity-100' : 'opacity-0',
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

        {/* Reset all filters */}
        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs"
            onClick={() => {
              table.getColumn('state')?.setFilterValue(undefined);
              table.getColumn('priority')?.setFilterValue(undefined);
            }}
          >
            Reset <X className="ml-1 h-3.5 w-3.5" />
          </Button>
        )}

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-8 text-xs">
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              View
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  className="capitalize text-xs"
                  checked={col.getIsVisible()}
                  onCheckedChange={(v) => col.toggleVisibility(v)}
                >
                  {col.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* New task */}
        <Button size="sm" className="h-8 text-xs" onClick={() => setCreateOpen(true)}>
          <PlusCircle className="mr-1.5 h-3.5 w-3.5" />
          New Task
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-md border">
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
                  className="cursor-pointer focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-muted-foreground"
                >
                  No tasks found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
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

      <TaskDetailSheet task={selectedTask} onClose={() => setSelectedTask(null)} />
      <CreateTaskDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onRefresh} />
    </>
  );
}
