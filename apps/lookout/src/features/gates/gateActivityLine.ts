import type { GateSummary } from './types';

const tickets = (n: number) => `${n} ticket${n === 1 ? '' : 's'}`;

/**
 * What a gate did lately, in one line: "Held 2 tickets in the last 14 days", "Would have held 3 tickets in the last
 * 14 days", both when its mode changed in between, or "Nothing held in the last 14 days".
 */
export function gateActivityLine(s: Pick<GateSummary, 'held' | 'wouldHold'>, days: number) {
  const when = `in the last ${days} days`;
  const held = s.held ? `Held ${tickets(s.held)}` : '';
  const would = s.wouldHold ? `would have held ${tickets(s.wouldHold)}` : '';
  if (held && would) return `${held}, ${would} ${when}`;
  if (held) return `${held} ${when}`;
  if (would) return `W${would.slice(1)} ${when}`;
  return `Nothing held ${when}`;
}
