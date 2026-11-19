import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrackerAdapter } from '../src/adapters/adapter';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { MemoryAdapter } from '../src/adapters/memoryAdapter';
import { GitHubAdapter } from '../src/adapters/remote/github';
import { LinearAdapter } from '../src/adapters/remote/linear';
import { outboxFile, outboxKey } from '../src/adapters/remote/outboxFile';
import { chartMap } from '../src/planning/operations/chart';
import { fakeGitHub } from './fakes/github';
import { fakeLinear } from './fakes/linear';
import { faulty } from './fixtures';
import { noSleep } from './scenarios';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'Edits', notes: '', decisions: [], unspecified: [], outOfScope: [] };

async function trail(a: TrackerAdapter) {
  const { map, tickets } = await chartMap(a, {
    title: 'Edits',
    sections: SECTIONS,
    tickets: [
      { ref: 'a', title: 'First', type: 'execute', body: 'Old scope' },
      { ref: 'b', title: 'Second', type: 'execute', body: '', blockedBy: ['a'] },
    ],
  });
  return { mapId: map.id, first: tickets[0], second: tickets[1] };
}

/** Edit, unblock, close and reopen through `a`; `fresh` reads the tracker again (or the same adapter). */
async function editFlow(a: TrackerAdapter, fresh: () => TrackerAdapter) {
  const { mapId, first, second } = await trail(a);
  await a.assign(mapId, first.id, 'claude-07');
  await a.editTicket(mapId, first.id, { title: 'First, revised', body: 'New scope' });
  await a.removeBlocking(mapId, first.id, second.id);
  await a.removeBlocking(mapId, first.id, second.id); // already gone: nothing happens
  await a.close(mapId, second.id, 'not_planned');
  await a.reopen(mapId, second.id);
  const snap = await fresh().loadMap(mapId);
  const [one, two] = [snap.tickets.find((t) => t.id === first.id)!, snap.tickets.find((t) => t.id === second.id)!];
  assert.equal(one.title, 'First, revised');
  assert.equal(one.body, 'New scope');
  assert.equal(one.assignee, 'claude-07', 'the claim survives an edit');
  assert.deepEqual(two.blockedBy, []);
  assert.equal(two.state, 'open');
  assert.equal(two.closeReason, undefined);
}

test('memory adapter: edit, remove a blocker, reopen', async () => {
  const a = new MemoryAdapter({ latency: [0, 0] });
  await editFlow(a, () => a);
});

test('markdown adapter: edit, remove a blocker, reopen, read back from the files', async () => {
  const root = tempFolder('teamtrail-edits-md-');
  const make = () => new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  await editFlow(make(), make);
});

test('github adapter: edit (title, body, meta kept), dependency removed, issue reopened', async () => {
  const fake = fakeGitHub({ repo: 'octo-org/launchpad' });
  const opts = { repo: 'octo-org/launchpad', token: 't', manual: true, ...noSleep };
  const a = new GitHubAdapter({ ...opts, fetch: fake.fetch });
  await editFlow(a, () => new GitHubAdapter({ ...opts, fetch: fake.fetch }));
  a.dispose();
});

test('linear adapter: edit, relation deleted, issue moved back to an unstarted state', async () => {
  const fake = fakeLinear();
  const opts = { apiKey: 'lin_api_test', teamId: 'team-eng', manual: true, ...noSleep };
  const a = new LinearAdapter({ ...opts, fetch: fake.fetch });
  await editFlow(a, () => new LinearAdapter({ ...opts, fetch: fake.fetch }));
  a.dispose();
});

test('github offline: edit, unblock and reopen wait in the outbox and land in order once back online', async () => {
  const root = tempFolder('teamtrail-edits-gh-');
  const fake = fakeGitHub({ repo: 'octo-org/launchpad' });
  const net = faulty(fake.fetch);
  const opts = { repo: 'octo-org/launchpad', token: 't', manual: true, retries: 0, ...noSleep };
  const a = new GitHubAdapter({ ...opts, fetch: net.fetch, outbox: outboxFile(root, outboxKey('github', opts.repo)) });
  const { mapId, first, second } = await trail(a);
  await a.close(mapId, second.id, 'completed');
  await a.tick();
  net.state.fault = 'offline';
  await a.editTicket(mapId, first.id, { title: 'Renamed offline' });
  await a.removeBlocking(mapId, first.id, second.id);
  await a.reopen(mapId, second.id);
  const cached = await a.loadMap(mapId);
  assert.equal(cached.tickets[0].title, 'Renamed offline', 'shown at once');
  assert.equal(a.status.queued, 3);
  net.state.fault = undefined;
  await a.tick();
  assert.equal(a.status.queued, 0);
  const remote = await new GitHubAdapter({ ...opts, fetch: fake.fetch }).loadMap(mapId);
  assert.equal(remote.tickets[0].title, 'Renamed offline');
  assert.deepEqual(remote.tickets[1].blockedBy, []);
  assert.equal(remote.tickets[1].state, 'open');
  a.dispose();
});
