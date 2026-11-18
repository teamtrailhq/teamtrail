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

/** A done ticket whose verified work was reverted on the default branch (at `at`, when known) is not merged any more. */
async function withReverts(o: { root: string; snap: MapSnapshot; merges: TicketMerge[]; at?: string }) {
  const escapes = await readEscapes(o.root, [o.snap], o.at ? { at: o.at } : {});
  const reverted = new Set(escapes.filter((e) => e.kind === 'reverted').map((e) => e.ticketId));
  if (!reverted.size) return o.merges;
  return o.merges.map((m) => (reverted.has(m.ticketId) ? { ...m, state: 'reverted' as const } : m));
}

/**
 * The merges as the commit a run would use sees them (trailHead.ts, as runTrailChecks.ts picks it): reverted when
 * that commit's history reverts them, and whether it holds the rest. One commit for both, so a revert on the remote
 * branch counts when the run would use the remote branch. A runner checks the merges itself, on its own head.
 */
async function marked(env: MainRunEnv, snap: MapSnapshot, found: TicketMerge[]): Promise<TicketMerge[]> {
  const commits = found.flatMap((m) => (m.state === 'merged' && m.commit ? [m.commit] : []));
  if (env.checkRunner || !commits.length) return withReverts({ root: env.root, snap, merges: found });
  const head = await trailHead(env.repoRoot ?? path.dirname(env.root), commits);
  const at = 'note' in head ? undefined : head.commit;
  const merges = await withReverts({ root: env.root, snap, merges: found, ...(at ? { at } : {}) });
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
  const merges = done.done && plan.kind === 'run' ? await marked(env, snap, found) : found;
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
