import { createHash } from 'node:crypto';
import { canonicalJson } from '../lib/canonicalJson';
import type { Proof, ProofReview } from '../model/proof';
import type { ProofGapItem } from '../model/proofGap';
import type { DecisionRecord } from '../model/types';
import type { CheckResult, VerificationAttempt, VerificationVerdict } from '../model/verification';
import { proofGapItems } from './proofGapItems';
import { proofRules } from './proofRules';

export interface ProofInput {
  ticket: Proof['ticket'];
  trail: string;
  /** The ticket's attempts in the order they were written. */
  attempts: VerificationAttempt[];
  /** The ticket's verdicts, any order; only the latest attempt's count. */
  verdicts: VerificationVerdict[];
  /** The decisions the work relies on: the ticket's own and those of the tickets it was blocked by. */
  decisions: DecisionRecord[];
  /** The ticket was done and is open again: the proof isn't verified, whatever its last completion says. */
  reopened?: boolean;
}

const passed = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;

/** A reviewer is independent of the author when it is another session, and another origin when both are known. */
function review(v: VerificationVerdict, a: VerificationAttempt): ProofReview {
  const otherSession = !v.sessionId || v.sessionId !== a.sessionId;
  const otherOrigin = !v.origin || !a.origin || v.origin !== a.origin;
  return {
    by: v.by,
    byKind: v.byKind,
    verdict: v.verdict,
    summary: v.summary,
    independent:
      v.byKind === 'trail lead' || (otherSession && otherOrigin && v.by !== a.agent && v.sameModel !== 'held'),
    ...(v.model ? { model: v.model } : {}),
    ...(v.sameModel ? { sameModel: v.sameModel } : {}),
  };
}

function criteriaOf(a?: VerificationAttempt): Proof['criteria'] {
  const c = a?.criteria;
  if (!c) return { lines: [], verified: 0, claimed: 0, missing: 0, failed: 0, manual: 0, confirmed: false };
  const notVerified = new Set([...c.missing, ...c.failed, ...c.manual, ...(c.claimed ?? [])]);
  return {
    lines: c.lines,
    verified: c.evidence.filter((e) => !notVerified.has(e.id)).length,
    claimed: c.claimed?.length ?? 0,
    missing: c.missing.length,
    failed: c.failed.length,
    manual: c.manual.length,
    confirmed: c.confirmed === true,
  };
}

function gitOf(a?: VerificationAttempt): Proof['git'] {
  const g = a?.git;
  if (!g?.tree) return undefined;
  return {
    base: g.base?.head ?? null,
    head: g.tree.head ?? null,
    branch: g.tree.branch ?? null,
    files: g.stats.files,
    add: g.stats.add,
    del: g.stats.del,
    // the guard's findings have a section of their own (`guard`)
    flags: g.flags.filter((f) => !OWN_SECTION.includes(f.kind)).map((f) => f.kind),
    ...scopeOf(a),
  };
}

const SCOPE_KINDS: string[] = ['outside-scope', 'in-scope'];
const OWN_SECTION: string[] = ['no-git', 'check-guard', ...SCOPE_KINDS];

/** The attempt's scope, when its evidence carries a scope flag. */
function scopeOf(a?: VerificationAttempt) {
  const f = a?.git?.flags.find((x) => SCOPE_KINDS.includes(x.kind));
  if (!f) return {};
  return { scope: { declared: a?.touches ?? [], outside: f.kind === 'outside-scope' ? (f.files ?? []) : [] } };
}

/** Checks that passed only on retry, and whether the trail lead counted the pass; nothing when there are none. */
function retriedOf(a: VerificationAttempt | undefined, reviews: ProofReview[]): Pick<Proof, 'retried'> {
  const f = a?.flaky;
  if (!f?.checks.length) return {};
  const accepted = reviews.some((r) => r.byKind === 'trail lead' && r.verdict === 'PASS');
  return {
    retried: f.checks.map((c) => ({
      name: c.name,
      ...(c.test ? { test: c.test } : {}),
      failedIn: c.failedIn,
      head: c.head,
      mode: f.mode,
      accepted,
    })),
  };
}
/** The check guard's findings, and the trail lead's acceptance of a pass it held. */
function guardOf(a: VerificationAttempt | undefined, reviews: ProofReview[]): Proof['guard'] {
  if (!a?.guard?.findings.length) return undefined;
  const by =
    a.guard.mode === 'enforce' ? reviews.find((r) => r.byKind === 'trail lead' && r.verdict === 'PASS') : undefined;
  return {
    mode: a.guard.mode,
    findings: a.guard.findings.map((f) => f.text),
    ...(by ? { accepted: { by: by.by, reason: by.summary } } : {}),
  };
}

/** The author's model: the attempt's own, else what a review of it compared against. */
const authorModel = (a: VerificationAttempt | undefined, verdicts: VerificationVerdict[]) =>
  a && (a.model ?? verdicts.find((v) => v.attemptId === a.id && v.authorModel)?.authorModel);

/** The latest attempt as the proof shows it; an empty, failed one when nothing was submitted. */
function attemptOf(a?: VerificationAttempt, model?: string): Proof['attempt'] {
  if (!a) return { id: '', agent: '', result: 'error', submittedAt: 0, finishedAt: 0, resolution: '', remote: false };
  return {
    id: a.id,
    agent: a.agent,
    result: a.result,
    submittedAt: a.submittedAt,
    finishedAt: a.finishedAt,
    resolution: a.resolution,
    pr: a.pr,
    remote: a.remote === true,
    ...(a.remote && a.runner ? { runner: a.runner } : {}),
    ...(model ? { model } : {}),
  };
}

/**
 * The proof of one ticket's completion: what Teamtrail recorded, never what an agent says now. Pure and
 * deterministic: the same recorded data always gives the same proof and digest.
 */
export const buildProof = (input: ProofInput): Proof => buildProofWithGaps(input).proof;

/** The proof with each of its gaps' kinds (proofGapItems.ts), which the proof itself keeps only as lines. */
export function buildProofWithGaps(input: ProofInput): { proof: Proof; gaps: ProofGapItem[] } {
  const latest = input.attempts.at(-1);
  const reviews = latest
    ? input.verdicts
        .filter((v) => v.attemptId === latest.id)
        .sort((x, y) => x.at - y.at)
        .map((v) => review(v, latest))
    : [];
  const items = proofGapItems({ attempt: latest, reviews, reopened: input.reopened });
  const gaps = items.map((g) => g.text);
  const guard = guardOf(latest, reviews);
  const body: Omit<Proof, 'digest'> = {
    v: 1,
    ticket: input.ticket,
    trail: input.trail,
    status: gaps.length ? 'not-verified' : 'verified',
    gaps,
    level: latest?.level ?? 'off',
    attempt: attemptOf(latest, authorModel(latest, input.verdicts)),
    earlier: input.attempts.slice(0, -1).map((a) => ({ id: a.id, result: a.result })),
    checks: (latest?.checks ?? []).map((c) => ({
      name: c.name,
      argv: c.argv,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      passed: passed(c),
      ...(latest?.knownFailures?.some((k) => k.name === c.name) ? { knownFailure: true as const } : {}),
    })),
    ...(latest?.waived?.length
      ? { waived: latest.waived.map((w) => ({ name: w.name, argv: w.argv, by: w.by, reason: w.reason })) }
      : {}),
    ...(latest?.outOfScope?.length
      ? { outOfScope: latest.outOfScope.map((c) => ({ name: c.name, argv: c.argv, reason: c.reason })) }
      : {}),
    ...retriedOf(latest, reviews),
    ...(guard ? { guard } : {}),
    criteria: criteriaOf(latest),
    git: gitOf(latest),
    reviews,
    decisions: [...input.decisions]
      .sort((x, y) => x.decidedAt - y.decidedAt)
      .map((d) => ({
        id: d.id,
        summary: d.summary,
        decidedBy: d.decidedBy,
        ...(d.decidedByName ? { decidedByName: d.decidedByName } : {}),
        decidedAt: d.decidedAt,
        superseded: Boolean(d.supersededBy),
      })),
    ...(latest?.guides ? { guides: latest.guides } : {}),
    ...(latest?.rules?.length ? { rules: proofRules(latest) } : {}),
  };
  const proof = { ...body, digest: `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}` };
  return { proof, gaps: items };
}
