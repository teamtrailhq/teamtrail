import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { journalFile } from '../src/history/journalFile';
import { derivePhases } from '../src/planning/lifecycle/phase';
import { openReviews } from '../src/planning/lifecycle/reviewTicket';
import { transition } from '../src/planning/lifecycle/transition';
import { chartMap } from '../src/planning/operations/chart';
import { readRunLock } from '../src/verification/runLock';
import { levelFor, verify } from '../src/verification/verifyCompletion';
import { approveAllHere } from './fakes/trailLead';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

// A run that reads as finished (its lock gone: `running` in the Lookout, `verification_status` waiting) is one whose
// outcome is in place: the ticket moved on and its review is open. Before, the lock was dropped as soon as the
// attempt was written, so a reader could see a finished run with no review yet, or the last attempt's review still
// open, about to be withdrawn, and offer it to an agent.
test('the run lock is held until the outcome is applied: the review opens while the run still reads as running', async () => {
  const repo = tempFolder('teamtrail-runlock-');
  const root = path.join(repo, '.teamtrail');
  mkdirSync(root);
  writeFileSync(
    path.join(root, 'verification.json'),
    JSON.stringify({ v: 1, checks: { ok: { run: [process.execPath, '-e', '0'] } }, run: ['ok'] }),
  );
  approveAllHere(root);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Lock',
    sections: SECTIONS,
    verification: 'checks+review',
    tickets: [{ ref: 'a', title: 'Build it', type: 'execute', body: '' }],
  });
  const id = tickets[0].id;
  const worker = { actor: 'Scout-1', actorKind: 'agent' as const };
  await transition(adapter, map.id, id, { ...worker, event: 'claim' });
  await transition(adapter, map.id, id, { ...worker, event: 'submit' });
  // what a reader of the lock sees at the moment each review ticket is created
  const lockedAtReview: boolean[] = [];
  const create = adapter.createTicket.bind(adapter);
  adapter.createTicket = async (mapId, input) => {
    if (input.type === 'review') lockedAtReview.push(!!readRunLock(root, map.id, id));
    return create(mapId, input);
  };
  const env = { adapter, root, journal: journalFile(root) };
  const run = async () => {
    const snap = await adapter.loadMap(map.id);
    const t = snap.tickets.find((x) => x.id === id)!;
    const sub = { agent: 'Scout-1', resolution: 'built it' };
    return (await verify(env, { mapId: map.id, ticket: t, info: levelFor(root, snap, t).info, sub })).done;
  };
  await run();
  // checked again (as on Confirm criteria): the first review is withdrawn and a new one opened, under the lock too
  await run();
  assert.deepEqual(lockedAtReview, [true, true]);
  assert.equal(readRunLock(root, map.id, id), undefined, 'released once settled');
  const snap = await adapter.loadMap(map.id);
  assert.equal(derivePhases(snap.tickets).get(id), 'verifying');
  assert.equal(openReviews(snap, id).length, 1);
});
