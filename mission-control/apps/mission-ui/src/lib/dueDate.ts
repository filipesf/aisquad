/**
 * Format a due_date string for display.
 * Returns { absolute, relative, isOverdue } or null if no due date.
 *
 * absolute: "Mar 12, 2026"
 * relative: "in 3 days" | "2 days overdue" | "today" | "tomorrow" | "yesterday"
 * isOverdue: true when due date is in the past (past midnight of due day)
 */
export function formatDueDate(dueDateIso: string | null | undefined): {
  absolute: string;
  relative: string;
  isOverdue: boolean;
} | null {
  if (!dueDateIso) return null;

  const due = new Date(dueDateIso);
  if (Number.isNaN(due.getTime())) return null;

  const now = new Date();

  // Compare at day granularity (local time)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const todayDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((dueDay.getTime() - todayDay.getTime()) / (1000 * 60 * 60 * 24));

  const absolute = due.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: due.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });

  let relative: string;
  if (diffDays === 0) relative = 'today';
  else if (diffDays === 1) relative = 'tomorrow';
  else if (diffDays === -1) relative = 'yesterday';
  else if (diffDays > 1) relative = `in ${diffDays} days`;
  else relative = `${Math.abs(diffDays)} days overdue`;

  return { absolute, relative, isOverdue: diffDays < 0 };
}

/**
 * Convert a due_date ISO string (or null) to a YYYY-MM-DD value for <input type="date">.
 * Returns "" when null/undefined.
 */
export function toDateInputValue(dueDateIso: string | null | undefined): string {
  if (!dueDateIso) return '';
  const d = new Date(dueDateIso);
  if (Number.isNaN(d.getTime())) return '';
  // YYYY-MM-DD in local time
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert a YYYY-MM-DD string from <input type="date"> to a UTC ISO string.
 * Returns null when value is empty.
 */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null;
  // Treat the date as local midnight, store as ISO
  const d = new Date(`${value}T00:00:00`);
  return d.toISOString();
}
