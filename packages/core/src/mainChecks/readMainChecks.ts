import path from 'node:path';
import { requiresDiscovery } from '../discovery/discoveryGate';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import type { MainChecksView, MainRun } from '../model/mainChecks';
import { defaultHead } from './defaultHead';
import { mainChecksPlan, type MainChecksPlan } from './mainChecksPlan';
import { mainChecksState } from './mainChecksState';
import { carryMainChoices, readMainChoices } from './mainChoicesStore';
import { latestMainRun, MAIN_DIR } from './mainRunStore';
import { runSettledWithin } from './runSettledWithin';
import { startMainRun, type MainRunEnv } from './startMainRun';

/** Which run each trail first started from: a trail ready for work starts from main as it is then. */
const SEEN = `${MAIN_DIR}/trails.json`;

const seenRun = (root: string, mapId: string) => readJsonFile<Record<string, string>>(path.join(root, SEEN))?.[mapId];

function markSeen(root: string, mapId: string, runId: string) {
  const all = readJsonFile<Record<string, string>>(path.join(root, SEEN)) ?? {};
  if (all[mapId] !== runId) writeLocalJson(root, SEEN, { ...all, [mapId]: runId });
}

/** The default branch's head here now; none with a runner (it runs on its own head) or outside git. */
async function headHere(env: MainRunEnv) {
  if (env.checkRunner) return undefined;
  const head = await defaultHead(env.repoRoot ?? path.dirname(env.root));
  return 'commit' in head ? head.commit : undefined;
}

/**
 * A run is due for a trail ready for work: none yet, one with other checks, one that failed on another commit than
 * the default branch's head now (main moved, perhaps fixed), or (the first time this trail asks) one on another commit.
 */
async function due(env: MainRunEnv, o: { mapId: string; run?: MainRun; hash: string }) {
  const { run } = o;
  if (!run || run.configHash !== o.hash) return true;
  if (run.result === 'running') return false;
  const head = await headHere(env);
  const moved = !!head && !!run.commit && head !== run.commit;
  if (run.result === 'fail') return moved;
  return moved && !seenRun(env.root, o.mapId);
}

async function triggered(env: MainRunEnv, o: { mapId: string; plan: MainChecksPlan; by: string; waitMs: number }) {
  if (o.plan.kind === 'off') return undefined;
  const { budgetMs } = o.plan;
  const run = latestMainRun(env.root, budgetMs);
  // a run already going (the Lookout's loop or another agent started it) is waited for as one started here
  const going = (r?: MainRun) => runSettledWithin(env.root, { run: r, budgetMs, ms: o.waitMs });
  if (!(await due(env, { mapId: o.mapId, run, hash: o.plan.hash }))) return going(run);
  const start = startMainRun(env, o.by);
  if (start.kind === 'running') return going(start.run ?? run);
  if (start.kind === 'off') return run;
  if (run?.result === 'fail' && run.configHash === o.plan.hash) carryMainChoices(env.root, run.id, start.run.id);
  return settledWithin(start, o.waitMs);
}

/** The run once it settles, or as it is after `ms`: one that can't happen (no git, no default branch) settles at once. */
async function settledWithin(start: { run: MainRun; done: Promise<MainRun> }, ms: number): Promise<MainRun> {
  if (ms <= 0) return start.run;
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<MainRun>((resolve) => {
    timer = setTimeout(() => resolve(start.run), ms);
  });
  try {
    return await Promise.race([start.done.catch(() => start.run), late]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Checks on main for one trail: the latest run, the trail lead's choices, and whether implementation claims wait.
 * With `trigger` (who asks), a trail ready for work that has no run to go by starts one, waiting up to `waitMs` for
 * it, or for the one already running: a short wait lets a quick run, or one that can't happen, answer the same call.
 */
export async function readMainChecks(
  env: MainRunEnv,
  mapId: string,
  o: { trigger?: string; waitMs?: number } = {},
): Promise<MainChecksView> {
  const plan = mainChecksPlan(env.root);
  const ready = !requiresDiscovery(env.root, mapId);
  const by = o.trigger;
  const run =
    by && ready
      ? await triggered(env, { mapId, plan, by, waitMs: o.waitMs ?? 0 })
      : latestMainRun(env.root, plan.kind === 'run' ? plan.budgetMs : 0);
  if (by && ready && run) markSeen(env.root, mapId, run.id);
  const choices = readMainChoices(env.root, mapId);
  const hashed = plan.kind === 'off' ? plan : { kind: 'run' as const, hash: plan.hash };
  const headNow = run?.result === 'fail' ? await headHere(env) : undefined;
  const gate = mainChecksState({ plan: hashed, ready, run, choices, ...(headNow ? { headNow } : {}) });
  return { mapId, ...gate, ...(run ? { run } : {}), choices };
}
