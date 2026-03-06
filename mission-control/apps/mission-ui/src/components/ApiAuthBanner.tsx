import { ApiError } from '@/lib/api';
import { ErrorBanner } from '@/components/ErrorBanner';

export function ApiAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.status !== 401) return null;

  return (
    <ErrorBanner
      title="Mission Control API authorization required"
      description={
        <>
          Set an agent token in browser storage and reload:{' '}
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
            localStorage.setItem('MC_AGENT_TOKEN', '&lt;token&gt;')
          </code>
        </>
      }
    />
  );
}
