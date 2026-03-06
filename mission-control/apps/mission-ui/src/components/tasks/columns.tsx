import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { formatDueDate } from '@/lib/dueDate';
import { cn } from '@/lib/utils';
import type { Task } from '@/types/domain';

const PRIORITY_LABELS: Record<number, string> = {
  10: 'Urgent',
  8: 'High',
  5: 'Medium',
  2: 'Low'
};

function priorityLabel(priority: number): string {
  if (priority >= 10) return 'Urgent';
  if (priority >= 8) return 'High';
  if (priority >= 5) return 'Medium';
  return 'Low';
}

interface TaskColumnCallbacks {
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
}

export function getTaskColumns(callbacks: TaskColumnCallbacks): ColumnDef<Task>[] {
  return [
    {
      accessorKey: 'title',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Title
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium text-sm">{row.getValue('title')}</span>
    },
    {
      accessorKey: 'state',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.getValue('state')} />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id))
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 h-8"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Priority
          <ArrowUpDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      ),
      cell: ({ row }) => {
        const p = row.getValue<number>('priority');
        return <span className="text-muted-foreground text-sm">{priorityLabel(p)}</span>;
      },
      filterFn: (row, id, value: string[]) =>
        value.includes(priorityLabel(row.getValue<number>(id)))
    },
    {
      accessorKey: 'updated_at',
      header: 'Updated',
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          <TimeAgo date={row.getValue('updated_at')} />
        </span>
      )
    },
    {
      accessorKey: 'due_date',
      header: 'Due',
      cell: ({ row }) => {
        const fmt = formatDueDate(row.getValue<string | null>('due_date'));
        if (!fmt) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <span className={cn('text-sm', fmt.isOverdue ? 'text-destructive' : 'text-muted-foreground')}>
            {fmt.absolute}
            <span className="ml-1.5 text-xs opacity-70">· {fmt.relative}</span>
          </span>
        );
      }
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const task = row.original;
        return (
          // Stop propagation so clicking the menu doesn't open the detail sheet
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label={`Actions for task: ${task.title}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => callbacks.onEdit(task)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => callbacks.onDelete(task)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      }
    }
  ];
}

// Export labels for filter use
export { PRIORITY_LABELS, priorityLabel };
