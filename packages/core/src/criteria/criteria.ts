import type { VerificationLevel } from '../model/lifecycle';
import type { TicketType } from '../model/types';
import type { CheckResult } from '../model/verification';

/**
 * Acceptance criteria: what "done" means for a ticket, agreed before the work starts. Each criterion needs evidence
 * when the work is completed: a passing check from verification.json, a named test or command, the pull request,
 * or the trail lead's sign-off (`manual`). Stored per trail in `<tracker dir>/criteria/<mapId>.md`.
 */
export type CriterionKind = 'unit' | 'integration' | 'e2e' | 'regression' | 'business-rule' | 'security' | 'manual';
export const CRITERION_KINDS: CriterionKind[] = [
  'unit',
  'integration',
  'e2e',
  'regression',
  'business-rule',
  'security',
  'manual',
];

export interface Criterion {
  /** `AC-<n>`, per ticket. */
  id: string;
  text: string;
  kind: CriterionKind;
  /** The knowledge entry it comes from, e.g. `K-3` for a business rule. */
  source?: string;
}

export interface TicketCriteria {
  ticketId: string;
  ticketKey: string;
  criteria: Criterion[];
  /** The trail lead confirmed these criteria; cleared whenever they change. */
  confirmed?: boolean;
  /**
   * The file says confirmed, but not by the trail lead on this machine for these exact criteria: `elsewhere` or
   * `changed`. `confirmed` is then unset. Never written to the file.
   */
  approval?: 'elsewhere' | 'changed';
}

/**
 * A change an agent proposes to criteria the trail lead confirmed. The confirmed set stays in force (it is what
 * a completion is checked against) until the trail lead takes the proposal; one proposal per ticket, the latest.
 */
export interface CriteriaProposal {
  ticketId: string;
  ticketKey: string;
  criteria: Criterion[];
  /** Trail name of the agent that proposed it. */
  by: string;
  at: number;
}

/** Evidence an agent gives for one criterion: `check:<name>`, `test:<name>`, `command:<cmd>`, `pr`, or `manual`. */
export interface CriterionEvidence {
  id: string;
  evidence: string;
  note?: string;
}

export interface CriteriaResult {
  /** One line per criterion, as the ticket comment shows it. */
  lines: string[];
  /** Criteria with no evidence given. */
  missing: string[];
  /** Criteria whose evidence is a check that failed or didn't run. */
  failed: string[];
  /** Criteria the trail lead must sign off. */
  manual: string[];
  /**
   * Criteria whose evidence is the agent's word (a named test, a command, the pull request, free text): recorded
   * and shown as claimed, never as verified. Absent on attempts from before claims were told apart.
   */
  claimed?: string[];
  /** Whether the trail lead had confirmed the criteria this was checked against. */
  confirmed?: boolean;
  evidence: CriterionEvidence[];
}

export const CRITERIA_DIR = 'criteria';
export const isCriterionKind = (v: unknown): v is CriterionKind => CRITERION_KINDS.includes(v as CriterionKind);

/** Implementation tickets on trails with a discovery brief need criteria before they can be completed. */
export const IMPLEMENTATION_TYPES: TicketType[] = ['task', 'execute', 'prototype'];
export function criteriaRequired(hasBrief: boolean, type: TicketType, level: VerificationLevel) {
  return hasBrief && level !== 'off' && IMPLEMENTATION_TYPES.includes(type);
}

/** Numbers new criteria after the existing ones: `AC-1`, `AC-2`, … */
export function numbered(items: Omit<Criterion, 'id'>[]): Criterion[] {
  return items.map((c, i) => ({
    id: `AC-${i + 1}`,
    text: c.text.trim(),
    kind: c.kind,
    ...(c.source ? { source: c.source } : {}),
  }));
}

const passed = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/** How one criterion comes out of the evidence given for it. */
type Graded =
  | { kind: 'missing' }
  | { kind: 'failed'; why: string }
  | { kind: 'manual' }
  | { kind: 'verified'; evidence: string }
  | { kind: 'claimed'; evidence: string; signOff: boolean };

/** Criteria whose claimed evidence the human signs off: an agent's word is not enough for these. */
const SIGN_OFF_WHEN_CLAIMED: CriterionKind[] = ['security', 'business-rule'];

function grade(c: Criterion, e: CriterionEvidence | undefined, checks: CheckResult[]): Graded {
  const ev = e?.evidence.trim();
  if (!ev) return { kind: 'missing' };
  const name = ev.startsWith('check:') ? ev.slice(6).trim() : undefined;
  const run = name === undefined ? undefined : checks.find((x) => x.name === name);
  if (name !== undefined && !(run && passed(run)))
    return { kind: 'failed', why: `${ev} ${run ? 'failed' : "didn't run"}` };
  // A criterion the trail lead signs off stays theirs whatever evidence comes with it.
  if (ev === 'manual' || c.kind === 'manual') return { kind: 'manual' };
  if (name !== undefined) return { kind: 'verified', evidence: ev };
  return { kind: 'claimed', evidence: ev, signOff: SIGN_OFF_WHEN_CLAIMED.includes(c.kind) };
}

/**
 * Matches the agent's evidence to the criteria. Deterministic: a criterion with no evidence is missing; a `check:`
 * that didn't run or didn't pass fails it, and one that passed here verifies it; `manual` (the evidence, or the
 * criterion's kind) waits for the trail lead. Everything else (a named test, a command, the PR, free text) is the
 * agent's word: it is kept and marked "claimed, not verified", never as verified; on a security or business-rule
 * criterion it also waits for the trail lead's sign-off.
 */
export function checkCriteria(
  criteria: Criterion[],
  given: CriterionEvidence[],
  checks: CheckResult[],
): CriteriaResult {
  const byId = new Map(given.map((e) => [e.id, e]));
  const out: CriteriaResult = { lines: [], missing: [], failed: [], manual: [], claimed: [], evidence: [] };
  for (const c of criteria) {
    const e = byId.get(c.id);
    const g = grade(c, e, checks);
    if (e && g.kind !== 'missing') out.evidence.push(e);
    const note = e?.note ? ` (${e.note})` : '';
    switch (g.kind) {
      case 'missing':
        out.missing.push(c.id);
        out.lines.push(`${c.id} ✗ no evidence · ${c.text}`);
        break;
      case 'failed':
        out.failed.push(c.id);
        out.lines.push(`${c.id} ✗ ${g.why} · ${c.text}`);
        break;
      case 'manual':
        out.manual.push(c.id);
        out.lines.push(`${c.id} … needs your sign-off · ${c.text}`);
        break;
      case 'verified':
        out.lines.push(`${c.id} ✓ ${g.evidence}${note} · ${c.text}`);
        break;
      case 'claimed': {
        out.claimed!.push(c.id);
        if (g.signOff) out.manual.push(c.id);
        const tail = g.signOff ? ' · needs your sign-off' : '';
        out.lines.push(`${c.id} ? claimed, not verified: ${g.evidence}${note}${tail} · ${c.text}`);
        break;
      }
      default: {
        const unknown: never = g;
        throw new Error(`unknown grade ${(unknown as { kind?: string }).kind}`);
      }
    }
  }
  return out;
}

/** Business rules that apply to the ticket (by knowledge id) but no criterion covers yet. */
export function uncoveredRules(criteria: Criterion[], ruleIds: string[]) {
  const covered = new Set(criteria.map((c) => c.source).filter(Boolean));
  return ruleIds.filter((id) => !covered.has(id));
}
