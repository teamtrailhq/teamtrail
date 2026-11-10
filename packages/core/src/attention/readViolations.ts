import type { TrackerAdapter } from '../adapters/adapter';
import type { AgentSessionDoc } from '../agents/agentLink';
import type { MapSnapshot } from '../model/types';
import { caseInsensitiveFs } from '../policy/caseInsensitiveFs';
import { readPolicy } from '../policy/policyStore';
import { policyViolations, type PolicyViolation } from '../policy/policyViolations';
import { readAttempts } from '../verification/evidenceStore';

/**
 * The human's answers to questions agents asked on a ticket, with the category each was asked with. An fyi answer
 * covers nothing, as at the decision gate; a record from before answers kept their category covers nothing either.
 */
function answeredTickets(docs: AgentSessionDoc[]) {
  return docs.flatMap((d) =>
    d.answered.flatMap((a) => {
      const ticketId = a.ticketId ?? d.session.ticketId;
      if (!ticketId || !a.category || a.urgency === 'fyi') return [];
      return [{ mapId: a.mapId || d.session.mapId, ticketId, category: a.category }];
    }),
  );
}

/** The policy source's input: the latest attempt on each ticket, checked against the project's risk policy. */
export async function readViolations(input: {
  root: string;
  adapter: TrackerAdapter;
  snaps: MapSnapshot[];
  docs: AgentSessionDoc[];
}): Promise<PolicyViolation[]> {
  const { root, adapter, snaps, docs } = input;
  const attempts = snaps.flatMap((s) => s.tickets.flatMap((t) => readAttempts(root, s.map.id, t.id).slice(-1)));
  if (!attempts.length) return [];
  const withAttempts = snaps.filter((s) => attempts.some((a) => a.mapId === s.map.id));
  const decisions = (await Promise.all(withAttempts.map((s) => adapter.listDecisions(s.map.id)))).flat();
  return policyViolations({
    attempts,
    decisions,
    policy: readPolicy(root).policy,
    covered: answeredTickets(docs),
    caseInsensitive: caseInsensitiveFs(root),
  });
}
