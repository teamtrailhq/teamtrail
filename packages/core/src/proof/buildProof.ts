import { createHash } from 'node:crypto';
import { canonicalJson } from '../lib/canonicalJson';
import type { Proof, ProofReview } from '../model/proof';
import type { DecisionRecord } from '../model/types';
import type { CheckResult, VerificationAttempt, VerificationVerdict } from '../model/verification';
import { proofGaps } from './proofGaps';

export interface ProofInput {
  ticket: Proof['ticket'];
  trail: string;
  /** The ticket's attempts in the order they were written. */
  attempts: VerificationAttempt[];
  /** The ticket's verdicts, any order; only the latest attempt's count. */
  verdicts: VerificationVerdict[];
  /** The decisions the work relies on: the ticket's own and those of the tickets it was blocked by. */
  decisions: DecisionRecord[];
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
    independent: v.byKind === 'trail lead' || (otherSession && otherOrigin && v.by !== a.agent),
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
    flags: g.flags.filter((f) => f.kind !== 'no-git' && !SCOPE_KINDS.includes(f.kind)).map((f) => f.kind),
    ...scopeOf(a),
  };
}

const SCOPE_KINDS: string[] = ['outside-scope', 'in-scope'];

/** The attempt's scope, when its evidence carries a scope flag. */
function scopeOf(a?: VerificationAttempt) {
  const f = a?.git?.flags.find((x) => SCOPE_KINDS.includes(x.kind));
  if (!f) return {};
  return { scope: { declared: a?.touches ?? [], outside: f.kind === 'outside-scope' ? (f.files ?? []) : [] } };
}

/** The latest attempt as the proof shows it; an empty, failed one when nothing was submitted. */
function attemptOf(a?: VerificationAttempt): Proof['attempt'] {
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
  };
}

/**
 * The proof of one ticket's completion: what Teamtrail recorded, never what an agent says now. Pure and
 * deterministic: the same recorded data always gives the same proof and digest.
 */
export function buildProof(input: ProofInput): Proof {
  const latest = input.attempts.at(-1);
  const reviews = latest
    ? input.verdicts
        .filter((v) => v.attemptId === latest.id)
        .sort((x, y) => x.at - y.at)
        .map((v) => review(v, latest))
    : [];
  const gaps = proofGaps({ attempt: latest, reviews });
  const body: Omit<Proof, 'digest'> = {
    v: 1,
    ticket: input.ticket,
    trail: input.trail,
    status: gaps.length ? 'not-verified' : 'verified',
    gaps,
    level: latest?.level ?? 'off',
    attempt: attemptOf(latest),
    earlier: input.attempts.slice(0, -1).map((a) => ({ id: a.id, result: a.result })),
    checks: (latest?.checks ?? []).map((c) => ({
      name: c.name,
      argv: c.argv,
      exitCode: c.exitCode,
      durationMs: c.durationMs,
      passed: passed(c),
      ...(latest?.knownFailures?.some((k) => k.name === c.name) ? { knownFailure: true as const } : {}),
    })),
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
  };
  return { ...body, digest: `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}` };
}
