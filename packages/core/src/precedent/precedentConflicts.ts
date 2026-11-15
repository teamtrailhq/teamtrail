import type { DecisionRecord } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { globsOverlap } from '../workspaces/touches';

/** Verified work that changed files an earlier decision of the human's covers: worth a look before it ships. */
export interface PrecedentConflict {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  agent: string;
  /** When the work was submitted. */
  at: number;
  decisionId: string;
  decisionSummary: string;
  decidedBy: string;
  /** The changed files in that decision's area, at most five. */
  files: string[];
}

/** An agent's trail name (`claude-07`): its own decisions are recorded, not the human's call. */
const isAgent = (by: string) => /^[a-z]+-\d+$/.test(by);

/** The human's decisions on other tickets whose area this attempt changed again after they were made. */
function conflictsOf(
  a: VerificationAttempt,
  human: DecisionRecord[],
  areas: Map<string, string[]>,
): PrecedentConflict[] {
  const changed = a.git?.changed.map((c) => c.path) ?? [];
  const out: PrecedentConflict[] = [];
  for (const d of human) {
    if (d.ticketId === a.ticketId || d.decidedAt >= a.submittedAt) continue;
    const area = areas.get(`${d.mapId}/${d.id}`) ?? [];
    const files = changed.filter((f) => area.some((g) => globsOverlap(f, g))).slice(0, 5);
    if (!files.length) continue;
    out.push({
      mapId: a.mapId,
      ticketId: a.ticketId,
      ticketKey: a.ticketKey,
      agent: a.agent,
      at: a.submittedAt,
      decisionId: d.id,
      decisionSummary: d.summary,
      decidedBy: d.decidedBy,
      files,
    });
  }
  return out;
}

/**
 * For each ticket's latest passing attempt, the human's decisions on other tickets whose area (the files their own
 * verified work changed, precedentAreas.ts) it changed again after they were made. Deterministic; superseded
 * decisions and agents' own decisions never raise one.
 */
export function precedentConflicts(o: {
  attempts: VerificationAttempt[];
  decisions: DecisionRecord[];
  areas: Map<string, string[]>;
}): PrecedentConflict[] {
  const human = o.decisions.filter((d) => !d.supersededBy && !isAgent(d.decidedBy));
  return o.attempts.filter((a) => a.result === 'pass').flatMap((a) => conflictsOf(a, human, o.areas));
}
