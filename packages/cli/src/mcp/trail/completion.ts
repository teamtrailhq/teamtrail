import {
  OperationError,
  PHASE_OF,
  deriveStates,
  transition,
  type MapSnapshot,
  type Ticket,
  type LevelInfo,
} from '@teamtrail/core';
import {
  checksApproval,
  checksWaitReason,
  levelFor,
  readAttempts,
  readRunLock,
  readVerdicts,
  recoverInterrupted,
  rerun,
  verify,
  type Settled,
  type Submission,
} from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import type { WaitControl } from './types';
import { checksOf, feedbackOf, gitView, settledView } from './verificationView';

type Run = { attemptId: string; done: Promise<Settled> };
const runs = new WeakMap<AgentContext, Map<string, Run>>();
const runsOf = (ctx: AgentContext) => runs.get(ctx) ?? runs.set(ctx, new Map()).get(ctx)!;

/** Keeps a run in this process until it settles; a failure is logged, never thrown at nobody. */
function track(ctx: AgentContext, mapId: string, ticketId: string, run: Run) {
  const key = `${mapId}/${ticketId}`;
  runsOf(ctx).set(key, run);
  run.done
    .then(
      (s) =>
        ctx.activity.push({
          source: 'system',
          level: s.phase === 'done' ? 'ok' : 'warn',
          kind: s.phase === 'done' ? 'verified' : 'checks-failed',
          text: `${s.attempt.ticketKey} ${s.attempt.id} · ${s.phase}`,
          ticketId,
        }),
      (e) =>
        ctx.activity.push({
          source: 'system',
          level: 'alert',
          kind: 'checks-failed',
          text: `verification of ${ctx.keyOf(ticketId)} failed: ${(e as Error).message}`,
          ticketId,
        }),
    )
    .finally(() => runsOf(ctx).delete(key));
  return run;
}

/** Waits for a run up to `seconds`, renewing the lease and reporting progress every 15 s. */
async function awaitRun(ctx: AgentContext, run: Run, seconds: number, ctl: WaitControl) {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  const settled = await Promise.race([
    run.done,
    new Promise<undefined>((r) => {
      timer = setTimeout(() => r(undefined), seconds * 1000);
      ctl.signal?.addEventListener('abort', () => r(undefined), { once: true });
      tick = setInterval(() => {
        ctx.heartbeat();
        ctl.onProgress?.(Math.round((Date.now() - started) / 1000));
      }, 15_000);
    }),
  ]).finally(() => {
    clearTimeout(timer);
    clearInterval(tick);
  });
  return settled
    ? settledView(settled)
    : {
        status: 'verifying' as const,
        pending: true,
        attempt: run.attemptId,
        note: 'Checks are still running. Call verification_status with wait=true for the result.',
      };
}

/**
 * Completion of a ticket that needs verification: the ticket goes to
 * verifying, its checks run in this process, and the call waits for them up
 * to `seconds`. The run goes on when the wait ends.
 */
export async function submitVerified(
  ctx: AgentContext,
  job: { snap: MapSnapshot; ticket: Ticket; info: LevelInfo; sub: Submission },
  wait: { seconds: number; ctl: WaitControl },
) {
  const { snap, ticket: t, info, sub } = job;
  // Checks run only from the verification.json approved on this machine. Until then the completion waits: the
  // ticket stays the agent's, nothing runs, and the human is asked (attention item, Settings → Approvals).
  const approval = sub.remote ? undefined : checksApproval(ctx.root);
  if (approval?.waiting) return waitingForApproval(ctx, t.key, checksWaitReason(approval));
  await transition(ctx.adapter, snap.map.id, t.id, {
    event: 'submit',
    actor: sub.agent,
    actorKind: 'agent',
    expect: 'working',
    sessionId: sub.sessionId,
    reason: sub.summary,
    journal: ctx.journal,
  });
  ctx.leases.drop(snap.map.id, t.id);
  ctx.sessions.running()?.log(`${t.key} submitted · checks: ${info.checks.join(', ') || 'none'}`, 'step');
  const run = track(
    ctx,
    snap.map.id,
    t.id,
    await verify(ctx.verifyEnv(), { mapId: snap.map.id, ticket: t, info, sub }),
  );
  return awaitRun(ctx, run, wait.seconds, wait.ctl);
}

/** A completion held back because the check commands wait for the trail lead's approval on this machine. */
function waitingForApproval(ctx: AgentContext, key: string, note: string) {
  ctx.activity.push({
    source: 'system',
    level: 'warn',
    kind: 'asks-you',
    text: `${key} waits: check commands need your approval`,
  });
  return { status: 'waiting-approval' as const, pending: true as const, note };
}

/** `verification_status`: the attempts and verdicts of a ticket; with `wait`, until a running check finishes. */
export async function verificationStatus(
  ctx: AgentContext,
  input: { ticket?: string; trail?: string; wait?: boolean; waitSeconds?: number },
  defaultWait: number,
  ctl: WaitControl,
) {
  const snap = await ctx.resolveTrail(input.trail ?? (ctx.sessions.running()?.info.mapId || undefined));
  const ref = input.ticket ?? ctx.sessions.running()?.info.ticketId;
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`.');
  const t = ctx.findTicket(snap, ref);
  const run = runsOf(ctx).get(`${snap.map.id}/${t.id}`);
  const seconds = input.waitSeconds ?? defaultWait;
  if (input.wait && run) return awaitRun(ctx, run, seconds, ctl);
  if (input.wait) {
    const until = Date.now() + seconds * 1000;
    while (readRunLock(ctx.root, snap.map.id, t.id) && Date.now() < until && !ctl.signal?.aborted)
      await new Promise((r) => setTimeout(r, 500));
  }
  const fresh = await ctx.load(snap.map.id);
  const now = fresh.tickets.find((x) => x.id === t.id)!;
  const attempts = readAttempts(ctx.root, snap.map.id, t.id);
  const last = attempts.at(-1);
  return {
    ticket: now.key,
    phase: PHASE_OF[deriveStates(fresh.tickets, fresh.map.mode).get(t.id)!],
    level: levelFor(ctx.root, fresh, now).info.level,
    running: !!readRunLock(ctx.root, snap.map.id, t.id),
    attempts: attempts.map((a) => ({
      id: a.id,
      result: a.result,
      agent: a.agent,
      finishedAt: new Date(a.finishedAt).toISOString(),
    })),
    ...(last
      ? {
          latest: {
            id: last.id,
            result: last.result,
            checks: checksOf(last),
            feedback: feedbackOf(last),
            ...(last.git ? { git: gitView(last.git) } : {}),
            ...(last.note ? { note: last.note } : {}),
          },
        }
      : {}),
    verdicts: readVerdicts(ctx.root, snap.map.id, t.id).map((v) => ({
      id: v.id,
      attempt: v.attemptId,
      by: v.by,
      verdict: v.verdict,
      summary: v.summary,
    })),
  };
}

/** Runs whose process died are recorded as interrupted and started again here. */
export async function recoverRuns(ctx: AgentContext) {
  for (const a of recoverInterrupted(ctx.root)) {
    const snap = await ctx.load(a.mapId).catch(() => undefined);
    const run = snap && (await rerun(ctx.verifyEnv(), snap, a).catch(() => undefined));
    if (run) track(ctx, a.mapId, a.ticketId, run);
  }
}
