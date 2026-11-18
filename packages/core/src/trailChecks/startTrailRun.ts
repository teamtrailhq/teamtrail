import { randomBytes } from 'node:crypto';
import { journalFile } from '../history/journalFile';
import { mainChecksPlan } from '../mainChecks/mainChecksPlan';
import { lockMainRun } from '../mainChecks/mainRunStore';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import type { ActorKind } from '../model/lifecycle';
import type { TicketMerge, TrailRun } from '../model/trailChecks';
import { runTrailChecks } from './runTrailChecks';
import { trailRunKey } from './trailRunKey';
import { writeTrailRun } from './trailRunStore';

export type TrailRunStart =
  | { kind: 'started'; run: TrailRun; done: Promise<TrailRun> }
  | { kind: 'busy'; reason: string }
  | { kind: 'off'; reason: string };

const newId = () => `T-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

/** Every done ticket's work was merged and is in the commit the checks ran on, with every ticket done. */
const completeFor = (allDone: boolean, merges: TicketMerge[]) =>
  allDone && merges.every((m) => m.state === 'nothing' || (m.state === 'merged' && m.contained === true));

function journal(root: string, run: TrailRun, o: { action: 'run' | 'result'; actorKind: ActorKind }) {
  journalFile(root).append({
    v: 1,
    kind: 'trail-checks',
    at: Date.now(),
    mapId: run.mapId,
    action: o.action,
    runId: run.id,
    ...(o.action === 'result' ? { result: run.result, commit: run.commit } : {}),
    actor: run.by,
    actorKind: o.actorKind,
    ...(o.action === 'result' && run.note ? { reason: run.note } : {}),
  });
}

/**
 * Runs the approved checks (only from the verification.json approved on this machine) on the default branch for a
 * trail's merges, one run at a time per project, shared with runs on main. `allDone`: every ticket in scope is
 * closed, so a run that holds every merge verifies the trail together. Returns at once: the run is recorded and
 * journaled as running, and `done` settles with what it found, journaled too.
 */
export function startTrailRun(
  env: MainRunEnv,
  o: { mapId: string; merges: TicketMerge[]; allDone: boolean; by: string; actorKind: ActorKind },
): TrailRunStart {
  const plan = mainChecksPlan(env.root);
  if (plan.kind === 'off') return plan;
  const id = newId();
  const lock = lockMainRun(env.root, id, plan.budgetMs);
  if (!lock.ok) return { kind: 'busy', reason: 'Checks are running on main now. Try again when they finish.' };
  const run: TrailRun = {
    v: 1,
    id,
    mapId: o.mapId,
    commit: null,
    branch: null,
    startedAt: Date.now(),
    configHash: plan.hash,
    checks: [],
    result: 'running',
    by: o.by,
    merges: o.merges,
    complete: false,
    key: trailRunKey(plan.hash, o.merges),
    pid: process.pid,
  };
  writeTrailRun(env.root, run);
  journal(env.root, run, { action: 'run', actorKind: o.actorKind });
  const done = (async () => {
    try {
      const found = await runTrailChecks(env, { mapId: o.mapId, id, plan, merges: o.merges });
      const { pid: _pid, ...rest } = run;
      const { contains: _c, ...outcome } = found;
      const final: TrailRun = {
        ...rest,
        ...outcome,
        complete: completeFor(o.allDone, found.merges),
        finishedAt: Date.now(),
      };
      writeTrailRun(env.root, final);
      journal(env.root, final, { action: 'result', actorKind: 'engine' });
      return final;
    } finally {
      lock.release();
    }
  })();
  done.catch(() => undefined);
  return { kind: 'started', run, done };
}
