import path from 'node:path';
import { mainChecksPlan } from '../mainChecks/mainChecksPlan';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import type { TicketMerge, TrailChecksView } from '../model/trailChecks';
import type { MapSnapshot, Ticket } from '../model/types';
import { readEscapes } from '../scorecard/readEscapes';
import { readTrailMerges } from './readTrailMerges';
import { startTrailRun } from './startTrailRun';
import { trailChecksState } from './trailChecksState';
import { trailHead } from './trailHead';
import { trailRunKey } from './trailRunKey';
import { latestTrailRun } from './trailRunStore';
import { trailTogether } from './trailTogether';

/** Every ticket in scope (not ruled out) is closed. */
function doneness(tickets: Ticket[]) {
  const inScope = tickets.filter((t) => !(t.state === 'closed' && t.closeReason === 'not_planned'));
  const open = inScope.filter((t) => t.state === 'open').length;
  if (!inScope.length) return { done: false, reason: 'No tickets in scope yet.' };
  if (open) return { done: false, reason: `Runs once every ticket is done: ${open} still open.` };
  return { done: true, reason: '' };
}

/** A done ticket whose verified work was reverted on the default branch since is not merged any more. */
async function withReverts(root: string, snap: MapSnapshot, merges: TicketMerge[]): Promise<TicketMerge[]> {
  const reverted = new Set(
    (await readEscapes(root, [snap])).filter((e) => e.kind === 'reverted').map((e) => e.ticketId),
  );
  if (!reverted.size) return merges;
  return merges.map((m) => (reverted.has(m.ticketId) ? { ...m, state: 'reverted' as const } : m));
}

/** The merges marked with whether the default branch here holds them (a runner checks them itself). */
async function marked(env: MainRunEnv, merges: TicketMerge[]): Promise<TicketMerge[]> {
  const commits = merges.flatMap((m) => (m.state === 'merged' && m.commit ? [m.commit] : []));
  if (env.checkRunner || !commits.length) return merges;
  const head = await trailHead(env.repoRoot ?? path.dirname(env.root), commits);
  const has = (c: string) => !('note' in head) && head.contained.has(c);
  return merges.map((m) => (m.state === 'merged' && m.commit ? { ...m, contained: has(m.commit) } : m));
}

/**
 * Whether a trail was verified together: its tickets' merges, the latest combined run and where that leaves it.
 * With `trigger` (who asks: Teamtrail's loop), a trail whose every ticket is done and merged, with no run for exactly
 * these merges yet, starts one.
 */
export async function readTrailChecks(
  env: MainRunEnv,
  snap: MapSnapshot,
  o: { trigger?: string } = {},
): Promise<TrailChecksView> {
  const mapId = snap.map.id;
  const plan = mainChecksPlan(env.root);
  const done = doneness(snap.tickets);
  const found = readTrailMerges(env.root, snap);
  const merges = done.done && plan.kind === 'run' ? await marked(env, await withReverts(env.root, snap, found)) : found;
  const key = plan.kind === 'run' ? trailRunKey(plan.hash, merges) : '';
  let run = latestTrailRun(env.root, mapId, plan.kind === 'run' ? plan.budgetMs : 0);
  const hashed = plan.kind === 'off' ? plan : { kind: 'run' as const, hash: plan.hash };
  let state = trailChecksState({ plan: hashed, done, merges, key, run, runner: !!env.checkRunner });
  if (state.kind === 'due' && o.trigger) {
    const start = startTrailRun(env, { mapId, merges, allDone: true, by: o.trigger, actorKind: 'engine' });
    if (start.kind === 'started') {
      run = start.run;
      state = { kind: 'running' };
    }
  }
  return { mapId, state, together: trailTogether(state, run, merges), ...(run ? { run } : {}), merges };
}
