import type { Proof } from '../model/proof';
import type { DecisionRecord, MapSnapshot, Ticket } from '../model/types';
import { readAttempts, readVerdicts } from '../verification/evidenceStore';
import { buildProof } from './buildProof';

/**
 * The proof of one ticket from what this machine recorded: its attempts and verdicts in `.evidence/`, and the
 * decisions on the ticket and on the tickets it was blocked by. `decisions` is the trail's whole list.
 */
export function proofForTicket(input: {
  root: string;
  snap: MapSnapshot;
  ticket: Ticket;
  decisions: DecisionRecord[];
}): Proof {
  const { root, snap, ticket } = input;
  const relied = new Set([ticket.id, ...ticket.blockedBy]);
  return buildProof({
    ticket: { mapId: snap.map.id, id: ticket.id, key: ticket.key, title: ticket.title, type: ticket.type },
    trail: snap.map.title,
    attempts: readAttempts(root, snap.map.id, ticket.id),
    verdicts: readVerdicts(root, snap.map.id, ticket.id),
    decisions: input.decisions.filter((d) => d.ticketId !== undefined && relied.has(d.ticketId)),
  });
}
