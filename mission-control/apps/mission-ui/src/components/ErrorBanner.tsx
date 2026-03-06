import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface ErrorBannerProps {
  title: string;
  description: React.ReactNode;
  variant?: 'default' | 'destructive';
}

export function ErrorBanner({ title, description, variant = 'destructive' }: ErrorBannerProps) {
  return (
    <Alert variant={variant}>
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{description}</AlertDescription>
    </Alert>
  );
}
