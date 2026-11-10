import type { RiskPolicy } from '../model/risk';
import type { DecisionRecord } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { madeBy } from '../planning/decisions/decisionRecord';
import { ruleMatches } from './ruleMatches';

/** A completion that changed high-risk files without the human having a say on that ticket. */
export interface PolicyViolation {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  agent: string;
  attemptId: string;
  at: number;
  /** The changed files that matched a high-risk rule. */
  paths: string[];
  globs: string[];
  reason: string;
}

export interface ViolationInput {
  attempts: VerificationAttempt[];
  decisions: DecisionRecord[];
  policy: RiskPolicy;
  /** Tickets the human already weighed in on another way: an answered question, an approval. */
  covered?: { mapId: string; ticketId: string }[];
}

const keyOf = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;

/**
 * Agent completions whose changes touch files the policy marks high risk, on tickets with no human decision,
 * answer or approval. Only the latest attempt per ticket counts. Ordered newest first, then by ticket key.
 */
export function policyViolations(input: ViolationInput): PolicyViolation[] {
  const covered = new Set((input.covered ?? []).map((c) => keyOf(c.mapId, c.ticketId)));
  for (const d of input.decisions) if (d.ticketId && madeBy(d) === 'human') covered.add(keyOf(d.mapId, d.ticketId));
  const highRules = input.policy.paths.filter((r) => r.level === 'high');
  return latestPerTicket(input.attempts)
    .filter((a) => !covered.has(keyOf(a.mapId, a.ticketId)))
    .flatMap((a) => violationOf(a, highRules))
    .sort((x, y) => y.at - x.at || x.ticketKey.localeCompare(y.ticketKey));
}

function latestPerTicket(attempts: VerificationAttempt[]): VerificationAttempt[] {
  const latest = new Map<string, VerificationAttempt>();
  for (const a of attempts) {
    const key = keyOf(a.mapId, a.ticketId);
    const prev = latest.get(key);
    if (!prev || a.submittedAt > prev.submittedAt) latest.set(key, a);
  }
  return [...latest.values()];
}

function violationOf(a: VerificationAttempt, rules: RiskPolicy['paths']): PolicyViolation[] {
  const changed = (a.git?.changed ?? []).map((f) => f.path);
  const globs = rules.filter((r) => changed.some((p) => globMatch(r.glob, p))).map((r) => r.glob);
  if (!globs.length) return [];
  const paths = changed.filter((p) => globs.some((g) => globMatch(g, p)));
  const files = paths.length === 1 ? paths[0] : `${paths.length} files`;
  return [
    {
      mapId: a.mapId,
      ticketId: a.ticketId,
      ticketKey: a.ticketKey,
      agent: a.agent,
      attemptId: a.id,
      at: a.submittedAt,
      paths,
      globs,
      reason: `${a.agent} changed ${files} matching ${globs.join(', ')} without asking you`,
    },
  ];
}
