import type { ModelTier } from '../../model/modelTier';
import type { MapDoc, Ticket } from '../../model/types';
import { tierOfTicket } from './tierOfTicket';
import { tierRank } from './tierRank';

/**
 * The tickets a session may take on its own, best first. `candidates` come in `orderNext` order. Tickets at the
 * session's tier come first, then lower tiers, nearest first, so a strong session is never idle while work waits.
 * Higher tiers are left out. Ties keep the candidates' order.
 */
export function rankForSession(candidates: Ticket[], sessionTier: ModelTier, map: Pick<MapDoc, 'modelMatching'>) {
  const own = tierRank(sessionTier);
  const gap = (t: Ticket) => own - tierRank(tierOfTicket(t, map));
  return candidates
    .map((t, i) => ({ t, i, gap: gap(t) }))
    .filter((x) => x.gap >= 0)
    .sort((a, b) => a.gap - b.gap || a.i - b.i)
    .map((x) => x.t);
}
