import path from 'node:path';
import type { TrackerAdapter } from '../adapters/adapter';
import { withLocalGuard } from '../checkGuard/withLocalGuard';
import type { CriterionEvidence } from '../criteria/criteria';
import { completionEvidence, reverifies } from '../evidence/completionEvidence';
import { writeGated } from '../flaky/flakyGate';
import { listGuides } from '../guides/guideStore';
import { checksOfGuides, resolveGuides } from '../guides/resolveGuides';
import { droppedChecks, trailKnownFailures } from '../mainChecks/withKnownFailures';
import { BRAND } from '../model/brand';
import type { RuleAnswer } from '../model/diffRule';
import type { AttemptGuide } from '../model/guide';
import type { Journal, TicketPhase } from '../model/lifecycle';
import type { MapSnapshot, Ticket } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { resolve, type DecisionMeta } from '../planning/operations/resolve';
import { withApprovedLevel } from './approvedLevel';
import { assertConfirmed } from './assertConfirmed';
import { attemptBase } from './attemptBase';
import { checkoutFor } from './checkoutFor';
import type { CheckRunner } from './checkRunner';
import { checksWaitReason, trustedChecks } from './checksApproval';
import { DEFAULT_CONFIG } from './config';
import type { ConfigRead } from './configFile';
import { nextAttemptId, readAttempts } from './evidenceStore';
import { gradeAttempt } from './gradeAttempt';
import { attemptComment, outcomeOf } from './outcome';
import { verificationFor, type LevelInfo } from './policy';
import { remoteGraded } from './remoteCompletion';
import { requestReview } from './reviewRequest';
import { acquireRunLock, releaseRunLock } from './runLock';
import { runnerGraded } from './runnerGraded';
import { withoutWaived } from './withoutWaived';
import { withRules } from './withRules';

/** The engine as an actor: comments and journal lines of the check runner. */
export const CHECK_RUNNER = BRAND.slug;

export interface VerifyEnv {
  adapter: TrackerAdapter;
  /** Tracker folder: `verification.json`, `.evidence/`, `.agents/runs/`. */
  root: string;
  /** Checks run here; defaults to the folder that holds the tracker folder. */
  repoRoot?: string;
  journal?: Journal;
  signal?: AbortSignal;
  /** An embedding server's runner for remote agents' completions (checkRunner.ts); without one nothing runs for them. */
  checkRunner?: CheckRunner;
}

/** The repo a tracker's checks and git evidence use. */
export const repoRootOf = (env: Pick<VerifyEnv, 'root' | 'repoRoot'>) => env.repoRoot ?? path.dirname(env.root);

/** What the agent claimed, kept on the attempt and used to resolve the ticket when it passes; `model` it ran on. */
export interface Submission extends Pick<VerificationAttempt, 'model'> {
  agent: string;
  sessionId?: string;
  resolution: string;
  summary?: string;
  rationale?: string;
  alternatives?: string[];
  /** In-process only: the decision record's audit fields and the HITL transcript to post. */
  decision?: DecisionMeta;
  transcript?: string;
  /** Why no files changed is fine for this ticket; the no-changes flag then stays informational. */
  noCodeReason?: string;
  /** The pull request with this work; kept on the attempt, where PR sync finds it. */
  pr?: number;
  /** In-process only: this run already re-runs a pass that went stale. */
  reverified?: boolean;
  /** Evidence for each acceptance criterion of the ticket. */
  criteria?: CriterionEvidence[];
  /** The agent is on another machine: this checkout doesn't hold its work, so no check runs here. */
  remote?: boolean;
  /** Who is behind the agent (see `VerificationAttempt.origin`). */
  origin?: string;
  /** The repo-relative files the agent said it changed. */
  declaredPaths?: string[];
  /** The path globs the agent declared at its claim (`touches`), read from its lease before it's dropped. */
  touches?: string[];
  /** The guides the ticket takes on now, kept on the attempt for its proof. */
  guides?: AttemptGuide[];
  /** Answers to the diff rules the change matched that ask a question (model/diffRule.ts). */
  ruleAnswers?: RuleAnswer[];
}

/** One ticket's completion to verify: its level, and what the agent submitted. */
export interface VerifyJob {
  mapId: string;
  ticket: Ticket;
  info: LevelInfo;
  sub: Submission;
  /** In-process only: the checks the trail lead waived for the ticket, left out of `info.checks`. */
  waived?: string[];
}

export interface Settled {
  attempt: VerificationAttempt;
  phase: TicketPhase;
  /** Failed attempts so far, this one included. */
  failures: number;
  maxAttempts: number;
}

/**
 * The level a completion of `t` needs, with the config it was read from. A ticket's guides add the checks they
 * require, the union of them all (resolveGuides.ts); they never change the level or drop a check. A disabled guide
 * keeps adding the checks of its last approved version.
 */
export function levelFor(root: string, snap: MapSnapshot, t: Ticket): { info: LevelInfo; config: ConfigRead } {
  // the approved config and the approved level: an edit to verification.json or to a trail's or ticket's level in
  // the tracker files lowers nothing until the trail lead approves it (approvedLevel.ts)
  const { config } = trustedChecks(root);
  const asked = verificationFor(config.config, snap.map, t);
  const approved = withApprovedLevel(root, { config: config.config, map: snap.map, t, info: asked });
  // checks the trail lead dropped for this trail because they fail on main (mainChecks/chooseMain.ts)
  const dropped = droppedChecks(root, snap.map.id);
  const info = dropped.length ? { ...approved, checks: approved.checks.filter((c) => !dropped.includes(c)) } : approved;
  const guides = resolveGuides(listGuides(root), { map: snap.map, ticket: t });
  if (!guides.length) return { info, config };
  return { info: { ...info, checks: checksOfGuides(info.checks, guides) }, config };
}

/**
 * Runs the checks for a ticket that is verifying, writes the attempt and moves
 * the ticket on (done, rework, blocked, or still verifying for review). The
 * attempt id is taken under the ticket's run lock, so only one run per ticket
 * happens at a time across processes. While verification.json is not the file
 * the trail lead approved on this machine, no command runs: the attempt is an
 * error naming why, so the ticket goes to the human instead of staying stuck
 * (completions are held before they get here, submitVerified in the CLI).
 */
export async function verify(env: VerifyEnv, asked: VerifyJob): Promise<{ attemptId: string; done: Promise<Settled> }> {
  assertConfirmed(asked.ticket, asked.info);
  // Read once: the commands that run are the ones whose approval was just checked.
  const { config, approval } = trustedChecks(env.root);
  const waiting = approval.waiting ? checksWaitReason(approval) : undefined;
  // the checks the trail lead accepted this ticket without don't run; the attempt keeps them for its proof
  const { job, waived } = withoutWaived(env.root, asked, config.config);
  const { mapId, ticket: t, sub } = job;
  const base = attemptBase({ job, configHash: config.hash, runner: env.checkRunner?.name, waived });
  const id = nextAttemptId(env.root, mapId, t.id);
  const lock = acquireRunLock(env.root, { ...base, id });
  if (!lock.ok)
    throw new OperationError(`${t.key} is already being verified (${lock.holder.id}, pid ${lock.holder.pid})`);
  if (lock.recovered) {
    // the dead run took the id we picked: start over with the next one
    releaseRunLock(env.root, mapId, t.id);
    return verify(env, asked);
  }
  const done = (async (): Promise<Settled> => {
    let attempt: VerificationAttempt;
    try {
      const graded = await grade(env, job, { id, config, waiting });
      // written once, with the flaky gate's finding on it
      attempt = writeGated(env.root, { ...base, id, finishedAt: Date.now(), ...graded }, config.config);
    } finally {
      releaseRunLock(env.root, mapId, t.id);
    }
    if (reverifies(attempt, config.config, !!sub.reverified)) return reverify(env, asked, attempt);
    return settle(env, attempt, sub, (config.config ?? DEFAULT_CONFIG).maxAttempts);
  })();
  return { attemptId: id, done };
}

/**
 * What an attempt finds: for a remote agent, the embedding server's runner (else nothing runs); nothing for
 * unapproved commands; else the checks here.
 */
async function grade(env: VerifyEnv, job: VerifyJob, run: { id: string; config: ConfigRead; waiting?: string }) {
  const runner = env.checkRunner;
  if (job.sub.remote) {
    // a remote agent's files are its word: its declared paths decide which rules apply
    const ruled = withRules({ root: env.root, config: run.config.config, job, files: job.sub.declaredPaths ?? [] });
    const graded = runner
      ? await runnerGraded({ ...env, checkRunner: runner }, { ...job, info: ruled.info }, run)
      : remoteGraded(env, job);
    return { ...graded, ...ruled.extra };
  }
  const checkout = checkoutFor(env, job.mapId, job.ticket.id);
  const none = run.waiting ?? (checkout.kind === 'none' ? `No check ran: ${checkout.reason}.` : undefined);
  if (none || checkout.kind === 'none') return { checks: [], result: 'error' as const, note: none };
  return gradeHere(env, job, { ...run, checkout: checkout.path });
}

/** Git evidence, checks and criteria for work that is in this checkout (or the ticket's worktree). */
async function gradeHere(env: VerifyEnv, job: VerifyJob, run: { id: string; config: ConfigRead; checkout: string }) {
  const { mapId, ticket: t, sub } = job;
  const git = await completionEvidence({
    ...env,
    repoRoot: run.checkout,
    mapId,
    ticket: t,
    config: run.config,
    noCodeReason: sub.noCodeReason,
    touches: sub.touches,
  });
  // the diff rules the changed files match: their checks run with the ticket's, their answers go on the attempt
  const ruled = withRules({ root: env.root, config: run.config.config, job, files: git.changed.map((c) => c.path) });
  const { outcome, criteria } = await gradeAttempt({
    root: env.root,
    repoRoot: run.checkout,
    mapId,
    ticketId: t.id,
    attemptId: run.id,
    config: run.config,
    info: ruled.info,
    git,
    evidence: sub.criteria,
    known: trailKnownFailures(env.root, mapId),
    waived: job.waived,
    signal: env.signal,
  });
  const graded = { ...outcome, git, ...(criteria ? { criteria } : {}), ...ruled.extra };
  return withLocalGuard(graded, { root: env.root, job, run, checks: ruled.info.checks }); // checkGuard/
}

/** Records that a pass went stale while its checks ran, and runs the checks again on the code as it is now. */
async function reverify(env: VerifyEnv, job: VerifyJob, a: VerificationAttempt) {
  const { mapId, ticket: t, sub } = job;
  await transition(env.adapter, mapId, t.id, {
    event: 'reverify',
    actor: CHECK_RUNNER,
    actorKind: 'engine',
    expect: 'verifying',
    reason: `${a.id} passed on code that changed while it ran`,
    sessionId: sub.sessionId,
    journal: env.journal,
  });
  return (await verify(env, { ...job, sub: { ...sub, reverified: true } })).done;
}

async function settle(env: VerifyEnv, a: VerificationAttempt, sub: Submission, maxAttempts: number): Promise<Settled> {
  const failures = readAttempts(env.root, a.mapId, a.ticketId).filter((x) => x.result === 'fail').length;
  const o = outcomeOf(a, failures, maxAttempts);
  const engine = {
    actor: CHECK_RUNNER,
    actorKind: 'engine' as const,
    reason: o.reason,
    sessionId: sub.sessionId,
    journal: env.journal,
  };
  await env.adapter.comment(a.mapId, a.ticketId, CHECK_RUNNER, attemptComment(a, o));
  if (o.to === 'done') {
    const d = sub.decision ?? {};
    await resolve(env.adapter, a.mapId, a.ticketId, {
      ...engine,
      event: 'checks.pass',
      answer: a.resolution,
      summary: a.summary,
      author: a.agent,
      transcript: sub.transcript,
      decision: { ...d, rationale: d.rationale ?? a.rationale, alternatives: a.alternatives ?? d.alternatives },
    });
  } else
    await transition(env.adapter, a.mapId, a.ticketId, { ...engine, event: o.event, to: o.to, expect: 'verifying' });
  if (o.to === 'verifying') await requestReview(env, a);
  return { attempt: a, phase: o.to, failures, maxAttempts };
}
