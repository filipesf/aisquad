import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ApiError } from '@/lib/api';

export function ApiAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.status !== 401) {
    return null;
  }

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>Mission Control API authorization required</AlertTitle>
      <AlertDescription>
        Set an agent token in browser storage and reload:{' '}
        <code className="rounded bg-black/20 px-1.5 py-0.5 text-xs">
          localStorage.setItem('MC_AGENT_TOKEN', '&lt;token&gt;')
        </code>
      </AlertDescription>
    </Alert>
  );
}
