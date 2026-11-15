import type { AttentionSource, Candidate } from '../types';

/** Verified work that changed files an earlier decision of the human's covers (precedent/precedentConflicts.ts). */
export const precedentSource: AttentionSource = {
  kind: 'precedent',
  collect({ precedentConflicts = [] }) {
    return precedentConflicts.map((c): Candidate => ({
      kind: 'precedent',
      mapId: c.mapId,
      ticketId: c.ticketId,
      title: `Check ${c.ticketKey}: it changes what ${c.decisionId} decided`,
      since: c.at,
      urgency: 'soon',
      ref: `${c.ticketId}:${c.decisionId}`,
      agent: c.agent,
      holds: [],
      notes: [`${c.decisionId}: ${c.decisionSummary} (${c.decidedBy})`, `changed ${c.files.join(', ')}`],
    }));
  },
};
