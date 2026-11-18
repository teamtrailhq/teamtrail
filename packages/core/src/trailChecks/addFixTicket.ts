import type { TrackerAdapter } from '../adapters/adapter';
import { journalFile } from '../history/journalFile';
import type { TrailRun } from '../model/trailChecks';
import type { Ticket } from '../model/types';
import { OperationError } from '../planning/operations/operationError';
import { readTrailRun } from './trailRunStore';

const label = (m: TrailRun['merges'][number]) => (m.pr !== undefined ? `PR #${m.pr}` : m.key);

/** Output inside a fence nothing in it can close. */
const fenced = (text: string) => ['~~~~text', text.replace(/~{4,}/g, '~~~'), '~~~~'];

function body(run: TrailRun): string {
  const failing = run.checks.filter((c) => !c.passed);
  const merged = run.merges.filter((m) => m.state === 'merged').map(label);
  const at = run.commit ? `${run.branch ?? 'main'} at ${run.commit.slice(0, 7)}` : (run.branch ?? 'main');
  return [
    `Every ticket on this trail passed its own checks, but together on ${at} these fail:`,
    '',
    ...failing.flatMap((c) => [
      `**${c.name}**: \`${c.argv.join(' ')}\` (exit ${c.exitCode ?? 'none'})`,
      ...fenced(c.tail),
      '',
    ]),
    ...(merged.length ? [`Merged before the run: ${merged.join(', ')}.`, ''] : []),
    'Fix it on a branch from the default branch, so the approved checks pass with all of the merged work. Teamtrail runs them on main again once this is merged.',
  ].join('\n');
}

/**
 * The trail lead's "Add a fix ticket" on a failed combined run: a task on the trail with the failing checks and their
 * output, for agents to pick up. Once it is done and merged, the checks run on main again by themselves. Asking twice
 * for the same run gives the same ticket while it exists. Journaled.
 */
export async function addFixTicket(o: {
  root: string;
  adapter: TrackerAdapter;
  mapId: string;
  runId: string;
  by: string;
}): Promise<Ticket> {
  const run = readTrailRun(o.root, o.mapId, o.runId);
  if (!run || run.result !== 'fail')
    throw new OperationError('That run on main did not fail: there is nothing to fix.');
  const snap = await o.adapter.loadMap(o.mapId);
  const earlier = journalFile(o.root)
    .readTrailChecks(o.mapId)
    .filter((e) => e.action === 'fix-ticket' && e.runId === run.id)
    .map((e) => snap.tickets.find((t) => t.id === e.ticketId))
    .find((t) => t !== undefined);
  if (earlier) return earlier;
  const names = run.checks.filter((c) => !c.passed).map((c) => c.name);
  const title = `Fix ${names.join(', ')} failing on main after the trail's merges`;
  const ticket = await o.adapter.createTicket(o.mapId, { title, type: 'task', body: body(run) });
  journalFile(o.root).append({
    v: 1,
    kind: 'trail-checks',
    at: Date.now(),
    mapId: o.mapId,
    action: 'fix-ticket',
    runId: run.id,
    ticketId: ticket.id,
    actor: o.by,
    actorKind: 'trail lead',
  });
  return ticket;
}
