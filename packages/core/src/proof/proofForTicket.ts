import type { Proof } from '../model/proof';
import type { ProofGapItem } from '../model/proofGap';
import type { DecisionRecord, MapSnapshot, Ticket } from '../model/types';
import { readAttempts, readVerdicts } from '../verification/evidenceStore';
import { buildProofWithGaps } from './buildProof';

interface TicketProofInput {
  root: string;
  snap: MapSnapshot;
  ticket: Ticket;
  decisions: DecisionRecord[];
  /** The ticket was done and is open again (buildProof's `reopened`). */
  reopened?: boolean;
}

/**
 * The proof of one ticket from what this machine recorded: its attempts and verdicts in `.evidence/`, and the
 * decisions on the ticket and on the tickets it was blocked by. `decisions` is the trail's whole list.
 */
export const proofForTicket = (input: TicketProofInput): Proof => proofWithGaps(input).proof;

/** The proof of one ticket with its gaps' kinds (buildProofWithGaps). */
export function proofWithGaps(input: TicketProofInput): { proof: Proof; gaps: ProofGapItem[] } {
  const { root, snap, ticket } = input;
  const relied = new Set([ticket.id, ...ticket.blockedBy]);
  return buildProofWithGaps({
    ticket: { mapId: snap.map.id, id: ticket.id, key: ticket.key, title: ticket.title, type: ticket.type },
    trail: snap.map.title,
    attempts: readAttempts(root, snap.map.id, ticket.id),
    verdicts: readVerdicts(root, snap.map.id, ticket.id),
    decisions: input.decisions.filter((d) => d.ticketId !== undefined && relied.has(d.ticketId)),
    ...(input.reopened ? { reopened: true } : {}),
  });
}
