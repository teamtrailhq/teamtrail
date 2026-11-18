import type { Ticket } from '../../model/types';
import { CHAIN_WEIGHT } from './spreadRuns';
import type { LaneLinks, LaneWish, Toward } from './types';

/**
 * Where a ticket wants to sit, looking `toward` one side: at the median of the cards it connects to there. A ticket
 * that continues a chain (its only link there, and that card's only link back) wants it most; a review that waits on
 * nothing sits beside the ticket it reviews.
 */
export function laneWish(input: {
  ticket: Ticket;
  layer: Ticket[];
  links: LaneLinks;
  toward: Toward;
  tops: Map<string, number>;
}): LaneWish {
  const { ticket, links, toward, tops } = input;
  const beside = input.layer.findIndex((t) => t.id === ticket.reviewOf);
  const near = links[toward].get(ticket.id) ?? [];
  if (ticket.type === 'review' && beside >= 0 && !near.length) return { beside, weight: -1, links: 0 };
  const spots = near.map((id) => tops.get(id)).filter((v): v is number => v !== undefined);
  if (!spots.length) return { weight: 0, links: 0 };
  const back = toward === 'blockers' ? links.blocked : links.blockers;
  const chain = near.length === 1 && (back.get(near[0]) ?? []).length === 1;
  return { at: median(spots), weight: weightOf({ ticket, chain }), links: near.length };
}

function weightOf(input: { ticket: Ticket; chain: boolean }) {
  if (input.chain) return CHAIN_WEIGHT;
  return input.ticket.type === 'review' ? 1 : 2;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
