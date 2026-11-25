export function prettyDate(value: string): string {
  if (!value) return 'Just now';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Just now'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * A short relative date ("Just now", "5m ago", "3h ago", "Yesterday", "4d ago"), falling back to
 * the absolute date after a week. `now` is a parameter so the result is testable.
 */
export function relativeDate(value: string, now: number = Date.now()): string {
  const time = new Date(value).valueOf();
  if (!value || Number.isNaN(time)) return 'Just now';
  const elapsed = Math.max(0, now - time);
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 2 * DAY) return 'Yesterday';
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return prettyDate(value);
}

/** The full date and time, for tooltips next to a relative date. */
export function absoluteDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? ''
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
