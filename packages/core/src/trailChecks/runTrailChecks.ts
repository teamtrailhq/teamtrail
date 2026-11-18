import path from 'node:path';
import type { MainChecksPlan } from '../mainChecks/mainChecksPlan';
import type { MainRunOutcome } from '../mainChecks/mainRunOutcome';
import { runMainHere } from '../mainChecks/runMainHere';
import { runMainOnRunner } from '../mainChecks/runMainOnRunner';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import type { TicketMerge } from '../model/trailChecks';
import { redact } from '../verification/redact';
import { trailHead } from './trailHead';
import { trailPaths } from './trailRunStore';

type Plan = Extract<MainChecksPlan, { kind: 'run' }>;

export type TrailOutcome = MainRunOutcome & { merges: TicketMerge[] };

const commitsOf = (merges: TicketMerge[]) =>
  merges.flatMap((m) => (m.state === 'merged' && m.commit ? [m.commit] : []));

const marked = (merges: TicketMerge[], has: (c: string) => boolean): TicketMerge[] =>
  merges.map((m) => (m.state === 'merged' && m.commit ? { ...m, contained: has(m.commit) } : m));

/** Here: on the default branch's commit that holds the most of the merges, in a worktree Teamtrail prepares. */
async function here(env: MainRunEnv, o: { mapId: string; id: string; plan: Plan; merges: TicketMerge[] }) {
  const repoRoot = env.repoRoot ?? path.dirname(env.root);
  const head = await trailHead(repoRoot, commitsOf(o.merges));
  if ('note' in head) {
    const none = { commit: null, branch: null, checks: [], result: 'unavailable' as const, note: head.note };
    return { ...none, merges: o.merges };
  }
  const job = { root: env.root, repoRoot, id: o.id, config: o.plan.config, names: o.plan.names, signal: env.signal };
  const found = await runMainHere({ ...job, head, logRel: trailPaths.logs(o.mapId, o.id) });
  return { ...found, merges: marked(o.merges, (c) => head.contained.has(c)) };
}

/** The commit to name to a runner: the default branch's here when it holds every merge, else none (its own head). */
async function namedHead(repoRoot: string, commits: string[]) {
  const head = await trailHead(repoRoot, commits);
  if ('note' in head || head.contained.size < commits.length) return { note: 'not every merge is here' };
  return head;
}

/**
 * On the embedding server's runner (Cloud), which says which merges the commit it ran on holds. It runs on exactly
 * the commit named here when this checkout's default branch holds every merge; else on the default branch's head.
 */
async function onRunner(env: MainRunEnv, o: { mapId: string; id: string; plan: Plan; merges: TicketMerge[] }) {
  const repoRoot = env.repoRoot ?? path.dirname(env.root);
  const known = await namedHead(repoRoot, commitsOf(o.merges));
  const found = await runMainOnRunner({
    root: env.root,
    repoRoot,
    id: o.id,
    runner: env.checkRunner!,
    config: o.plan.config,
    names: o.plan.names,
    signal: env.signal,
    head: 'note' in known ? null : { branch: known.branch, commit: known.commit },
    contains: commitsOf(o.merges),
    logRel: trailPaths.logs(o.mapId, o.id),
  });
  const said = new Set(found.contains ?? []);
  return { ...found, merges: marked(o.merges, (c) => said.has(c)) };
}

/**
 * The approved checks on the default branch for a trail's merges: here in a worktree Teamtrail prepares, or on the
 * embedding server's runner when it has one, never in the user's working tree. Each merge is marked with whether the
 * commit it ran on contains it.
 */
export async function runTrailChecks(
  env: MainRunEnv,
  o: { mapId: string; id: string; plan: Plan; merges: TicketMerge[] },
): Promise<TrailOutcome> {
  try {
    return await (env.checkRunner ? onRunner(env, o) : here(env, o));
  } catch (e) {
    const note = `the checks could not run: ${redact(String((e as Error)?.message ?? e).slice(0, 200))}`;
    return { result: 'unavailable', commit: null, branch: null, checks: [], note, merges: o.merges };
  }
}
