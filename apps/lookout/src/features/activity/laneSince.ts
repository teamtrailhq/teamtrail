/** How long an agent has been on its ticket, as a lane says it: "now", "14 min", "1 h 06". Pure. */
export function laneSince(ms: number) {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
