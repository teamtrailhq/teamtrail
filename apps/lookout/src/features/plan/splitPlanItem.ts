/**
 * A plan line as the parts of a row: `#14 End-to-end encryption — separate initiative` is the ticket key, the
 * title and the reason after the dash. Lines without a key or a reason are all title.
 */
export function splitPlanItem(line: string): { key?: string; title: string; reason?: string } {
  const [, key, rest = line] = /^(#\d+)\s+(.+)$/.exec(line) ?? [];
  const [title = rest, ...reason] = rest.split(/\s+[—–]\s+/);
  return { key, title, reason: reason.join(' — ') || undefined };
}
