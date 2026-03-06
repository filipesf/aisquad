/**
 * useToast — minimal toast hook.
 *
 * No external library. Uses a module-level event emitter so any component
 * can fire a toast without prop-drilling or a full context tree.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast({ title: 'Done.', description: 'Task completed.' });
 *   toast({ title: 'Error.', variant: 'destructive' });
 */
import { useState, useEffect, useCallback } from 'react';

export type ToastVariant = 'default' | 'success' | 'destructive';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Auto-dismiss delay in ms. Default 4000. */
  duration?: number;
}

type ToastInput = Omit<Toast, 'id'>;
type Listener = (toasts: Toast[]) => void;

// Module-level store — survives component re-mounts, avoids context overhead.
let toasts: Toast[] = [];
const listeners: Set<Listener> = new Set();

function notify() {
  for (const fn of listeners) {
    fn([...toasts]);
  }
}

function addToast(input: ToastInput): string {
  const id = Math.random().toString(36).slice(2, 9);
  toasts = [...toasts, { id, ...input }];
  notify();
  const duration = input.duration ?? 4000;
  setTimeout(() => removeToast(id), duration);
  return id;
}

function removeToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  notify();
}

/** Subscribe to the toast store and get current toasts. */
export function useToastStore() {
  const [store, setStore] = useState<Toast[]>([...toasts]);

  useEffect(() => {
    listeners.add(setStore);
    return () => {
      listeners.delete(setStore);
    };
  }, []);

  return { toasts: store, removeToast };
}

/** Fire toasts from any component. */
export function useToast() {
  const toast = useCallback((input: ToastInput) => addToast(input), []);
  return { toast };
}
