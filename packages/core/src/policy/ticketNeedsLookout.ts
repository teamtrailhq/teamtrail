import { readAgentDocs } from '../agents/agentDocs';
import type { RiskCategory } from '../model/risk';
import { readAttempts } from '../verification/evidenceStore';
import { needsLookout } from './needsLookout';

const MONTH = 30 * 24 * 3_600_000;

/**
 * Whether a ticket is one only the Lookout may decide: an agent asked about it with a category the risk policy
 * makes high, or its latest completion touched files a high-risk path rule matches. The guard for decisions that
 * reach this machine another way, such as Slack (planning/operations/lookoutGuard.ts).
 */
export async function ticketNeedsLookout(root: string, mapId: string, ticketId: string): Promise<boolean> {
  const latest = readAttempts(root, mapId, ticketId).at(-1);
  if (needsLookout.attempt(root, latest)) return true;
  const docs = await readAgentDocs(root, { recentMs: MONTH, limit: 1000 });
  const asked = docs.flatMap((d) => [
    ...d.pending
      .filter((q) => q.mapId === mapId && (q.ticketId ?? d.session.ticketId) === ticketId)
      .map((q) => ({ category: q.category, categories: q.categories })),
    ...d.answered
      .filter((q) => (q.mapId || d.session.mapId) === mapId && (q.ticketId ?? d.session.ticketId) === ticketId)
      .map((q) => ({ category: q.category as RiskCategory | undefined })),
  ]);
  return asked.some((q) => needsLookout.question(root, q));
}
