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
  /** The repo is on a filesystem that ignores case: the path rules do too. */
  caseInsensitive?: boolean;
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
    .flatMap((a) => violationOf(a, highRules, !!input.caseInsensitive))
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

/**
 * The files an attempt touched, as far as anyone can tell: what git saw change (local completions) and what the
 * agent declared (the only thing a remote completion has). `undeclared` are files git saw that the agent left out.
 */
function touchedBy(a: VerificationAttempt) {
  const changed = (a.git?.changed ?? []).map((f) => f.path);
  const declared = a.declaredPaths ?? [];
  const undeclared = a.declaredPaths ? changed.filter((p) => !declared.includes(p)) : [];
  return { all: [...new Set([...changed, ...declared])], undeclared };
}

function violationOf(a: VerificationAttempt, rules: RiskPolicy['paths'], fold: boolean): PolicyViolation[] {
  const { all, undeclared } = touchedBy(a);
  const hits = (p: string) => rules.filter((r) => ruleMatches(r.glob, p, fold)).map((r) => r.glob);
  const paths = all.filter((p) => hits(p).length);
  if (!paths.length) return [];
  const globs = [...new Set(paths.flatMap(hits))];
  const files = paths.length === 1 ? paths[0] : `${paths.length} files`;
  const hidden = paths.filter((p) => undeclared.includes(p));
  const how = a.remote ? 'says it changed' : 'changed';
  const extra = hidden.length ? ` (${hidden.length === 1 ? hidden[0] : `${hidden.length} of them`} not declared)` : '';
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
      reason: `${a.agent} ${how} ${files} matching ${globs.join(', ')} without asking you${extra}`,
    },
  ];
}
