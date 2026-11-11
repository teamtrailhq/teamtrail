import type { RerouteChange, RerouteProposal } from '../../model/reroute';
import type { MapSnapshot } from '../../model/types';
import { OperationError } from '../operations/operationError';
import { frozenTickets } from './frozenTickets';

/** What the limits need to know about a new proposal. */
export interface Proposer {
  by: string;
  origin?: string;
  lane?: RerouteProposal['lane'];
  changes: RerouteChange[];
}

/** Pending ordinary proposals a trail holds at most: past that, a new one waits until the trail lead decides one. */
export const MAX_PENDING_PER_TRAIL = 3;
/** Pending rule-out proposals one agent (or token) holds at most on a trail. */
export const MAX_RULE_OUTS = 5;
/** Pending requests to change a trail lead's setting a trail holds at most. */
export const MAX_SETTING_REQUESTS = 3;
/**
 * Pending proposals that together would freeze more than this share of the trail's open tickets (and at least
 * `WIDE_MIN` of them) stop the trail: the one that tips it over freezes nothing, and the trail lead is asked instead.
 */
export const WIDE_SHARE = 0.5;
export const WIDE_MIN = 3;
/** After the trail lead turns a proposal down, how long its proposer (or a rule-out of that ticket) waits. */
export const COOL_DOWN_MS = 5 * 60_000;

const sameProposer = (p: RerouteProposal, n: Proposer) => p.by === n.by || (!!n.origin && p.origin === n.origin);
const laneOf = (p: Pick<RerouteProposal, 'lane'>) => p.lane ?? 'plan';
const ruledOut = (p: Pick<RerouteProposal, 'changes'>) =>
  p.changes.flatMap((c) => (c.op === 'cancel_ticket' ? [c.ticket] : []));

/**
 * The pending proposals a new one replaces: the same agent's (or the same token's) ordinary proposal. A rule-out has
 * its own lane: it never replaces a plan of the agent's, nor is replaced by one.
 */
export const replacedBy = (all: RerouteProposal[], n: Proposer) =>
  laneOf(n) === 'plan' ? all.filter((p) => p.status === 'pending' && laneOf(p) === 'plan' && sameProposer(p, n)) : [];

const sameChanges = (a: Pick<RerouteProposal, 'changes'>, b: Pick<RerouteProposal, 'changes'>) =>
  JSON.stringify(a.changes) === JSON.stringify(b.changes);

/**
 * A pending rule-out of the same ticket, or a pending request for the same setting change: asking again returns it
 * instead of a new proposal.
 */
export function sameRuleOut(all: RerouteProposal[], n: Proposer) {
  const pending = all.filter((p) => p.status === 'pending' && laneOf(p) === laneOf(n));
  if (laneOf(n) === 'rule-out') return pending.find((p) => ruledOut(p)[0] === ruledOut(n)[0]);
  return laneOf(n) === 'setting' ? pending.find((p) => sameChanges(p, n)) : undefined;
}

/** The recent decline that makes this proposal wait: of the same ticket, the same setting, or the same proposer. */
function turnedDownFor(recent: RerouteProposal[], n: Proposer) {
  const lane = laneOf(n);
  const same = recent.filter((p) => laneOf(p) === lane);
  if (lane === 'rule-out') return same.find((p) => ruledOut(p)[0] === ruledOut(n)[0]);
  if (lane === 'setting') return same.find((p) => p.changes[0]?.op === n.changes[0]?.op);
  return same.find((p) => sameProposer(p, n));
}

/** Refuses a proposal the trail has no room for, or that comes too soon after the trail lead turned one down. */
export function assertRoom(all: RerouteProposal[], n: Proposer, now: number) {
  const recent = all.filter((p) => p.status === 'rejected' && now - (p.decidedAt ?? 0) < COOL_DOWN_MS);
  const lane = laneOf(n);
  const turnedDown = turnedDownFor(recent, n);
  if (turnedDown)
    throw new OperationError(
      `The human turned down ${turnedDown.id} ${Math.round((now - (turnedDown.decidedAt ?? now)) / 60_000)} min ago: wait ${COOL_DOWN_MS / 60_000} min before proposing it again, and read their note (reroute_status).`,
    );
  const pending = all.filter((p) => p.status === 'pending' && laneOf(p) === lane);
  if (lane === 'rule-out') {
    if (pending.filter((p) => sameProposer(p, n)).length >= MAX_RULE_OUTS)
      throw new OperationError(`You already have ${MAX_RULE_OUTS} rule-outs waiting on the human for this trail.`);
    return;
  }
  if (lane === 'setting') {
    if (pending.length >= MAX_SETTING_REQUESTS)
      throw new OperationError(`${pending.length} setting requests already wait on the human for this trail.`);
    return;
  }
  const others = pending.filter((p) => !sameProposer(p, n));
  if (others.length >= MAX_PENDING_PER_TRAIL)
    throw new OperationError(
      `${others.length} reroute proposals already wait on the human for this trail (${others.map((p) => p.id).join(', ')}). Keep working on the current plan until they decide one.`,
    );
}

/**
 * Whether the new proposal would leave too much of the trail's open work frozen, counting what every other pending
 * proposal (except those it replaces) already freezes: then it freezes nothing.
 */
export function wideness(snap: MapSnapshot, all: RerouteProposal[], n: Proposer) {
  const open = new Set(snap.tickets.filter((t) => t.state === 'open').map((t) => t.id));
  const replaced = new Set(replacedBy(all, n).map((p) => p.id));
  const kept = all.filter((p) => !replaced.has(p.id));
  const before = frozenTickets(kept);
  const after = frozenTickets([...kept, { id: '', status: 'pending', changes: n.changes }]);
  const mine = [...after.keys()].filter((id) => !before.has(id) && open.has(id)).length;
  const total = [...after.keys()].filter((id) => open.has(id)).length;
  const tooMuch = mine > 0 && total >= WIDE_MIN && total > open.size * WIDE_SHARE;
  return tooMuch ? { touched: total, open: open.size } : undefined;
}
