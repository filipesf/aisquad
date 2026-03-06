import type { ColumnDef } from '@tanstack/react-table';
import type { Task } from '@/types/domain';
import { StatusBadge } from '@/components/StatusBadge';
import { TimeAgo } from '@/components/TimeAgo';
import { Button } from '@/components/ui/button';
import { ArrowUpDown } from 'lucide-react';

const PRIORITY_LABELS: Record<number, string> = {
  10: 'Urgent',
  8: 'High',
  5: 'Medium',
  2: 'Low',
};

function priorityLabel(priority: number): string {
  if (priority >= 10) return 'Urgent';
  if (priority >= 8) return 'High';
  if (priority >= 5) return 'Medium';
  return 'Low';
}

export function getTaskColumns(): ColumnDef<Task>[] {
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
      cell: ({ row }) => (
        <span className="font-medium text-sm">{row.getValue('title')}</span>
      ),
    },
    {
      accessorKey: 'state',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.getValue('state')} />,
      filterFn: (row, id, value: string[]) => value.includes(row.getValue(id)),
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
        return (
          <span className="text-sm text-muted-foreground">{priorityLabel(p)}</span>
        );
      },
      filterFn: (row, id, value: string[]) =>
        value.includes(priorityLabel(row.getValue<number>(id))),
    },
    {
      accessorKey: 'updated_at',
      header: 'Updated',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          <TimeAgo date={row.getValue('updated_at')} />
        </span>
      ),
    },
  ];
}

// Export labels for filter use
export { PRIORITY_LABELS, priorityLabel };
