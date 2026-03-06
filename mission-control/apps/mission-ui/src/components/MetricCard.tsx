import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  label: string;
  value: string | number;
  className?: string;
}

export function MetricCard({ label, value, className }: MetricCardProps) {
  return (
    <Card className={cn('gap-2 py-4', className)}>
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {String(label).replace(/_/g, ' ')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}
