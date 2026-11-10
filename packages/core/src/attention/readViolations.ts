import type { TrackerAdapter } from '../adapters/adapter';
import type { AgentSessionDoc } from '../agents/agentLink';
import type { MapSnapshot } from '../model/types';
import { caseInsensitiveFs } from '../policy/caseInsensitiveFs';
import { readPolicy } from '../policy/policyStore';
import { policyViolations, type PolicyViolation } from '../policy/policyViolations';
import { readAttempts } from '../verification/evidenceStore';

/** Tickets the human weighed in on through a question an agent asked while working on them. */
function answeredTickets(docs: AgentSessionDoc[]) {
  return docs
    .filter((d) => d.answered.length > 0 && d.session.ticketId)
    .map((d) => ({ mapId: d.session.mapId, ticketId: d.session.ticketId as string }));
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
