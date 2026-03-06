import { useState, useCallback } from 'react';

/**
 * Tracks whether a named onboarding hint has been dismissed.
 *
 * State is persisted in localStorage so dismissals survive page refreshes.
 * Each key is namespaced under `mc_ob_` to avoid collisions with other
 * localStorage entries.
 *
 * @example
 * const { dismissed, dismiss } = useOnboarding('welcome-banner');
 * if (dismissed) return null;
 * return <Banner onClose={dismiss} />;
 */
export function useOnboarding(key: string): {
  dismissed: boolean;
  dismiss: () => void;
  reset: () => void;
} {
  const storageKey = `mc_ob_${key}`;

  const [dismissed, setDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      // localStorage unavailable (private browsing, storage quota) — fall through
    }
    setDismissed(true);
  }, [storageKey]);

  const reset = useCallback(() => {
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    setDismissed(false);
  }, [storageKey]);

  return { dismissed, dismiss, reset };
}
