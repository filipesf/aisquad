import { ApiError } from '../lib/api.ts';

export function ApiAuthBanner({ error }: { error: unknown }) {
  if (!(error instanceof ApiError) || error.status !== 401) {
    return null;
  }

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
      <p className="font-medium">Mission Control API authorization required</p>
      <p className="mt-1 text-amber-100/90">
        Set an agent token in browser storage and reload:
        <code className="ml-1 rounded bg-black/30 px-1.5 py-0.5 text-xs">
          localStorage.setItem('MC_AGENT_TOKEN', '&lt;token&gt;')
        </code>
      </p>
    </div>
  );
}
