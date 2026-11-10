/** How long ago, in words for a list: "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export function sinceLabel(at: number, now = Date.now()) {
  const min = Math.floor(Math.max(0, now - at) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? 'yesterday' : `${days} days ago`;
  return `on ${new Date(at).toISOString().slice(0, 10)}`;
}
