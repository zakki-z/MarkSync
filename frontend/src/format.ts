export function prettyDate(value: string): string {
  if (!value) return 'Just now';
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? 'Just now'
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
