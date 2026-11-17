import { randomBytes } from 'node:crypto';
import path from 'node:path';
import type { MainRun } from '../model/mainChecks';
import type { CheckRunner } from '../verification/checkRunner';
import { redact } from '../verification/redact';
import { mainChecksPlan } from './mainChecksPlan';
import type { MainRunOutcome } from './mainRunOutcome';
import { latestMainRun, lockMainRun, writeMainRun } from './mainRunStore';
import { runMainHere } from './runMainHere';
import { runMainOnRunner } from './runMainOnRunner';

/** Where a run on main runs: this tracker's repo, or the embedding server's runner when it has one. */
export interface MainRunEnv {
  /** Tracker folder. */
  root: string;
  /** The repo; defaults to the folder holding the tracker folder. */
  repoRoot?: string;
  /** An embedding server's runner (Cloud): runs on main go to it, never to this machine. */
  checkRunner?: CheckRunner;
  signal?: AbortSignal;
}

export type MainRunStart =
  | { kind: 'started'; run: MainRun; done: Promise<MainRun> }
  | { kind: 'running'; run?: MainRun }
  | { kind: 'off'; reason: string };

const newId = () => `M-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;

function outcome(
  env: MainRunEnv,
  o: { id: string; plan: Extract<ReturnType<typeof mainChecksPlan>, { kind: 'run' }> },
) {
  const repoRoot = env.repoRoot ?? path.dirname(env.root);
  const job = { root: env.root, repoRoot, id: o.id, config: o.plan.config, names: o.plan.names, signal: env.signal };
  return env.checkRunner ? runMainOnRunner({ ...job, runner: env.checkRunner }) : runMainHere(job);
}

async function settled(env: MainRunEnv, o: Parameters<typeof outcome>[1]): Promise<MainRunOutcome> {
  try {
    return await outcome(env, o);
  } catch (e) {
    const note = `checks on main could not run: ${redact(String((e as Error)?.message ?? e).slice(0, 200))}`;
    return { result: 'unavailable', commit: null, branch: null, checks: [], note };
  }
}

/**
 * Runs the approved checks on the default branch's head, once at a time per project (across processes); `by` is who
 * asked. Returns at once: the run is recorded as running, and `done` settles with what it found.
 */
export function startMainRun(env: MainRunEnv, by: string): MainRunStart {
  const plan = mainChecksPlan(env.root);
  if (plan.kind === 'off') return plan;
  const id = newId();
  const lock = lockMainRun(env.root, id, plan.budgetMs);
  if (!lock.ok) return { kind: 'running', run: latestMainRun(env.root, plan.budgetMs) };
  const run: MainRun = {
    v: 1,
    id,
    commit: null,
    branch: null,
    startedAt: Date.now(),
    configHash: plan.hash,
    checks: [],
    result: 'running',
    by,
    pid: process.pid,
  };
  writeMainRun(env.root, run);
  const done = (async () => {
    try {
      const found = await settled(env, { id, plan });
      const { pid: _pid, ...rest } = run;
      const final: MainRun = { ...rest, ...found, finishedAt: Date.now() };
      writeMainRun(env.root, final);
      return final;
    } finally {
      lock.release();
    }
  })();
  // nobody may wait for it: a failure to record is not a crash
  done.catch(() => undefined);
  return { kind: 'started', run, done };
}
