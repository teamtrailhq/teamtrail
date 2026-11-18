import type { AttemptGuard } from '../model/checkGuard';
import type { EvidenceFlag, GitEvidence } from '../model/evidence';
import type { AttemptResult } from '../model/verification';
import { recordGate } from '../verification/recordGate';
import { guardReason } from './guardReason';

/**
 * What the guard does to a graded attempt: its findings become a `check-guard` flag the reviewer and the agent see,
 * and a pass it holds keeps its checks' result but waits for the human (`outcomeOf`), with the reason as its note.
 * Journals the gate when it acts on a pass.
 */
export function applyGuard<T extends { result: AttemptResult; note?: string; git?: GitEvidence }>(
  graded: T,
  o: { guard?: AttemptGuard; root: string; mapId: string; ticket: { id: string; key: string } },
): T & { guard?: AttemptGuard; note?: string } {
  const { guard } = o;
  if (!guard) return graded;
  const reason = guardReason(guard.findings);
  const held = guard.mode === 'enforce' && graded.result === 'pass';
  const flag: EvidenceFlag = {
    kind: 'check-guard',
    level: held ? 'alert' : 'warn',
    message: `the work changed what its checks run: ${reason}`,
    files: [...new Set(guard.findings.map((f) => f.file).filter(Boolean))],
  };
  if (graded.git) graded.git.flags.push(flag);
  if (graded.result === 'pass')
    recordGate({ root: o.root, mapId: o.mapId, gate: 'check-guard', mode: guard.mode, reason, ticket: o.ticket });
  if (!held) return { ...graded, guard };
  const note = `The checks passed, but the work changed what they run: ${reason}. The pass counts once the trail lead accepts it.`;
  return { ...graded, guard, note };
}
