import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { writeTicketSync } from '../src/evidence/syncStore';
import { journalFile } from '../src/history/journalFile';
import type { PrState } from '../src/model/prEvidence';
import { DEFAULT_MAP_MODE, type MapSnapshot, type Ticket } from '../src/model/types';
import { proposeSetupChecks } from '../src/planning/lifecycle/proposeSetupChecks';
import { setupMergeReason } from '../src/readiness/setupMergeReason';
import { setupNotOnMain } from '../src/readiness/setupNotOnMain';
import { tempFolder } from './tempFolder';

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
const ticket = (over: Partial<Ticket>): Ticket => ({
  id: '2',
  key: '#2',
  title: 'Set up the project',
  type: 'task',
  body: '',
  state: 'closed',
  closeReason: 'completed',
  setup: true,
  blockedBy: [],
  comments: [],
  createdAt: 0,
  updatedAt: 0,
  ...over,
});
const snapOf = (tickets: Ticket[]): MapSnapshot => ({
  map: { id: 'app', key: '#1', title: 'App', mode: DEFAULT_MAP_MODE, sections: SECTIONS, createdAt: 0, updatedAt: 0 },
  tickets,
});

function prOf(root: string, state: PrState, url = 'https://github.com/o/r/pull/5') {
  const pr = { number: 5, url, title: '', state, draft: false, headSha: 'a'.repeat(40), headRef: 'b', sameRepo: true };
  writeTicketSync(root, {
    v: 1,
    mapId: 'app',
    ticketId: '2',
    ticketKey: '#2',
    provider: 'GitHub',
    link: { number: 5, source: 'branch', at: 0 },
    pr: { ...pr, review: 'none', mergeable: 'unknown', updatedAt: 0 } as never,
    checks: [],
    checksSummary: 'none',
    flags: [],
  });
}

test('the setup work waits to be merged: its open pull request, or a default branch still new', () => {
  const root = tempFolder('setup-merge-');
  const snap = snapOf([ticket({})]);
  assert.deepEqual(setupNotOnMain({ root, snap, stillNew: true }), { key: '#2' });
  assert.equal(setupNotOnMain({ root, snap }), undefined, 'no pull request and main not read as new: nothing said');
  prOf(root, 'open');
  const open = setupNotOnMain({ root, snap })!;
  assert.deepEqual(open, { key: '#2', pr: { number: 5, url: 'https://github.com/o/r/pull/5' } });
  assert.match(setupMergeReason(open), /merge its pull request #5 \(https:\/\/github\.com\/o\/r\/pull\/5\) first/);
  prOf(root, 'merged');
  assert.equal(setupNotOnMain({ root, snap, stillNew: true }), undefined, 'merged: nothing to wait for');
  prOf(root, 'open', 'javascript:alert(1)');
  assert.deepEqual(setupNotOnMain({ root, snap })?.pr, { number: 5 }, 'a link only when it is a web URL');
  assert.equal(setupNotOnMain({ root, snap: snapOf([ticket({ state: 'open', closeReason: undefined })]) }), undefined);
  assert.equal(setupNotOnMain({ root, snap: snapOf([ticket({ setup: undefined })]), stillNew: true }), undefined);
});

test('a proposal is written as the file and journaled, never through a link, never invalid', () => {
  const root = tempFolder('setup-propose-');
  const text = `${JSON.stringify({ v: 1, checks: { test: { run: ['npm', 'test'] } }, run: ['test'] })}\n`;
  // an older journal line of another kind before it: the reader keeps both
  mkdirSync(path.join(root, '.events'), { recursive: true });
  appendFileSync(path.join(root, '.events', 'app.jsonl'), `${JSON.stringify({ v: 1, kind: 'future-kind', at: 1 })}\n`);
  proposeSetupChecks({ root, mapId: 'app', ticketId: '2', by: 'claude-01', text, names: ['test'] });
  assert.equal(readFileSync(path.join(root, 'verification.json'), 'utf8'), text);
  const lines = readFileSync(path.join(root, '.events', 'app.jsonl'), 'utf8')
    .trim()
    .split('\n');
  const entry = JSON.parse(lines.at(-1)!);
  assert.deepEqual(
    [entry.kind, entry.ticketId, entry.actor, entry.checks],
    ['checks-proposed', '2', 'claude-01', ['test']],
  );
  assert.deepEqual(journalFile(root).readAll('app'), [], 'the trail reader skips kinds it does not read, old and new');
  assert.throws(
    () => proposeSetupChecks({ root, mapId: 'app', ticketId: '2', by: 'x', text: '{"v":1,"run":["nope"]}', names: [] }),
    /would be invalid/,
  );
  const other = tempFolder('setup-propose-link-');
  writeFileSync(path.join(other, 'target.json'), '{}');
  symlinkSync(path.join(other, 'target.json'), path.join(other, 'verification.json'));
  assert.throws(
    () => proposeSetupChecks({ root: other, mapId: 'app', ticketId: '2', by: 'x', text, names: ['test'] }),
    /is a link/,
  );
  assert.equal(readFileSync(path.join(other, 'target.json'), 'utf8'), '{}');
});
