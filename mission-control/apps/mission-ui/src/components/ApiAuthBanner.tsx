import { ApiError } from '@/lib/api';
import { ErrorBanner } from '@/components/ErrorBanner';
import { InlineCode } from '@/components/ui/InlineCode';

export function ApiAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.status !== 401) return null;

  return (
    <ErrorBanner
      title="API access token required"
      description={
        <>
          Paste your agent token in the browser console, then reload the page:{' '}
          <InlineCode>localStorage.setItem('MC_AGENT_TOKEN', '&lt;token&gt;')</InlineCode>
        </>
      }
    />
  );
}
