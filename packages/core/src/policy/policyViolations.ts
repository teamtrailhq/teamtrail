import type { RiskCategory, RiskPolicy } from '../model/risk';
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
  /**
   * Answers the human gave on a ticket, with the category the question was asked with. Like the decision gate, an
   * answer covers a high-risk rule only when it was asked with that rule's category (any category, for a rule
   * without one); an answer asked without a category covers nothing.
   */
  covered?: { mapId: string; ticketId: string; category?: RiskCategory }[];
  /** The repo is on a filesystem that ignores case: the path rules do too. */
  caseInsensitive?: boolean;
}

const keyOf = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;

/**
 * Agent completions whose changes touch files the policy marks high risk, on tickets with no human decision,
 * answer or approval. Only the latest attempt per ticket counts. Ordered newest first, then by ticket key.
 */
export function policyViolations(input: ViolationInput): PolicyViolation[] {
  const asked = coverage(input);
  const highRules = input.policy.paths.filter((r) => r.level === 'high');
  const open = (a: VerificationAttempt) => {
    const cats = asked.get(keyOf(a.mapId, a.ticketId)) ?? new Set<RiskCategory>();
    return highRules.filter((r) => !(r.category ? cats.has(r.category) : cats.size > 0));
  };
  return latestPerTicket(input.attempts)
    .flatMap((a) => violationOf(a, open(a), !!input.caseInsensitive))
    .sort((x, y) => y.at - x.at || x.ticketKey.localeCompare(y.ticketKey));
}

/** The categories the human answered in, per ticket: from answers and from decisions recorded as theirs. */
function coverage(input: ViolationInput) {
  const out = new Map<string, Set<RiskCategory>>();
  const add = (mapId: string, ticketId: string, category?: RiskCategory) => {
    if (!category) return;
    const key = keyOf(mapId, ticketId);
    out.set(key, (out.get(key) ?? new Set()).add(category));
  };
  for (const c of input.covered ?? []) add(c.mapId, c.ticketId, c.category);
  // `madeBy` is 'teammate' for a record another tracker account posted (`postedBy`): that person's call, never
  // this machine's human's, so it covers nothing here.
  for (const d of input.decisions)
    if (d.ticketId && !d.postedBy && madeBy(d) === 'human') add(d.mapId, d.ticketId, d.risk?.category);
  return out;
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
