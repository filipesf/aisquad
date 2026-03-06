import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { InlineCode } from '@/components/ui/InlineCode';
import { ApiError } from '@/lib/api';

/**
 * Shown when the API returns HTTP 401.
 *
 * Guides the operator through the exact steps to set their agent token —
 * numbered for clarity, with the console command as copyable inline code.
 */
export function ApiAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.status !== 401) return null;

  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>API token required</AlertTitle>
      <AlertDescription>
        <ol className="mt-1.5 list-inside list-decimal space-y-1 text-sm">
          <li>
            Open your browser&apos;s developer console{' '}
            <span className="text-xs opacity-75">(⌥⌘I on Mac, F12 on Windows)</span>
          </li>
          <li>
            Paste and run:{' '}
            <InlineCode>localStorage.setItem('MC_AGENT_TOKEN', '&lt;your-token&gt;')</InlineCode>
          </li>
          <li>Reload the page</li>
        </ol>
        <p className="mt-2 text-xs opacity-75">
          Your token is the <InlineCode>session_key</InlineCode> from the agent registration
          response.
        </p>
      </AlertDescription>
    </Alert>
  );
}
