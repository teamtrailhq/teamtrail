import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { deriveStates } from '../src/planning/derive';
import { chartMap } from '../src/planning/operations/chart';
import { claim } from '../src/planning/operations/claims';
import { recordDecision } from '../src/planning/operations/decisionOps';
import { outsideChanges } from '../src/signedState/outsideChanges';
import { revertState } from '../src/signedState/revertState';
import { stateRecordFile } from '../src/signedState/stateRecord';
import { approveTogether } from '../src/trust/approveTogether';
import { approveTrust } from '../src/trust/approveTrust';
import { pendingTrust } from '../src/trust/pendingTrust';
import { trustLedger } from '../src/trust/trustLedger';
import { withCommitted } from '../src/trust/withCommitted';

/*
 * Signed state: a trail's gate fields count only when Teamtrail wrote them on this machine (or the human accepted
 * them here). Each attack below is an agent, or a teammate's push, editing the tracker files directly.
 */

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

/** A process of its own, writing through Teamtrail at the same time as others (the concurrency test). */
if (process.env.SIGNED_STATE_WORKER) {
  const [root, mapId, who] = process.env.SIGNED_STATE_WORKER.split('|');
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: who }), watch: undefined }, root);
  for (let i = 0; i < 6; i++) await adapter.createTicket(mapId, { title: `${who} ${i}`, type: 'task', body: '' });
  process.exit(0);
}

const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signed-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};

async function trail(root: string, mode: 'plan+execute' | 'plan-only' = 'plan+execute', title = 'Trail') {
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root, { by: 'agent claude-01' }), watch: undefined }, root);
  const { map, tickets } = await chartMap(adapter, {
    title,
    mode,
    sections: SECTIONS,
    tickets: [
      { ref: 'j', title: 'Pick the store', type: 'junction', body: 'Which store?' },
      { ref: 'x', title: 'Build it', type: 'execute', body: 'Do it.', blockedBy: ['j'] },
    ],
  });
  // in the plan's order; a plan-only trail has no execute ticket
  return { adapter, mapId: map.id, j: tickets[0].id, x: tickets[1]?.id };
}

/** An edit made with a text editor (or `sed`), not through Teamtrail. */
function edit(root: string, rel: string, from: RegExp | string, to: string) {
  const file = path.join(root, rel);
  const text = readFileSync(file, 'utf8');
  const next = text.replace(from, to);
  assert.notEqual(next, text, `the edit applies to ${rel}`);
  writeFileSync(file, next);
}

const ticketOf = async (a: MarkdownAdapter, mapId: string, id: string) =>
  (await a.loadMap(mapId)).tickets.find((t) => t.id === id)!;

test('an agent closes a ticket in its file: it reads as not closed, held for the human, and is flagged', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  edit(root, `${mapId}/tickets/${j}.md`, /^state: open$/m, 'state: closed');
  edit(root, `${mapId}/tickets/${j}.md`, /^close_reason: .*$/m, 'close_reason: completed');
  const t = await ticketOf(adapter, mapId, j);
  assert.equal(t.state, 'open');
  assert.equal(t.closeReason, undefined);
  assert.equal(t.status, 'blocked', 'held until the human accepts or reverts it');
  const out = outsideChanges(root).changes.find((c) => c.id === j)!;
  assert.deepEqual(out.fields.sort(), ['close_reason', 'state']);
  assert.ok(pendingTrust(root).some((i) => i.kind === 'state' && i.ticketId === j));
});

test('an agent turns a junction into a task in its file: the gates still see a junction', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  edit(root, `${mapId}/tickets/${j}.md`, /^type: junction$/m, 'type: task');
  assert.equal((await ticketOf(adapter, mapId, j)).type, 'junction');
});

test('an agent writes a decision file "decided by the trail lead": it is not a decision', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  const real = await recordDecision(adapter, mapId, {
    ticketId: j,
    question: 'Which store?',
    answer: 'SQLite',
    decidedBy: 'claude-01',
    source: { kind: 'agent' },
  });
  const forged = readFileSync(path.join(root, `${mapId}/decisions/${real.id}.md`), 'utf8')
    .replace(`id: ${real.id}`, 'id: D-9')
    .replace('decided_by: claude-01', 'decided_by: trail lead')
    .replace('source: agent', 'source: lookout');
  writeFileSync(path.join(root, `${mapId}/decisions/D-9.md`), forged);
  const ids = (await adapter.listDecisions(mapId)).map((d) => d.id);
  assert.deepEqual(ids, [real.id]);
  // and a signed decision edited to the human's name keeps its signed author
  edit(root, `${mapId}/decisions/${real.id}.md`, 'decided_by: claude-01', 'decided_by: trail lead');
  const [d] = await adapter.listDecisions(mapId);
  assert.equal(d.decidedBy, 'claude-01');
  const flagged = outsideChanges(root).changes.map((c) => c.id);
  assert.ok(flagged.includes('D-9') && flagged.includes(real.id));
});

test('a trail level or a ticket level lowered in frontmatter: the signed level applies', async () => {
  const root = tmpRoot();
  const { adapter, mapId, x } = await trail(root);
  await adapter.setMapMeta(mapId, { verification: 'checks+review' });
  await adapter.setMeta(mapId, x, { verification: 'checks+review' });
  edit(root, `${mapId}/map.md`, /^verification: checks\+review$/m, 'verification: off');
  edit(root, `${mapId}/tickets/${x}.md`, /^verification: checks\+review$/m, 'verification: off');
  const snap = await adapter.loadMap(mapId);
  assert.equal(snap.map.verification, 'checks+review');
  assert.equal(snap.tickets.find((t) => t.id === x)!.verification, 'checks+review');
});

test('a trail switched from plan-only to plan+execute in its file: the signed mode applies', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await trail(root, 'plan-only');
  edit(root, `${mapId}/map.md`, /^mode: plan-only$/m, 'mode: plan+execute');
  edit(root, `${mapId}/map.md`, /, teamtrail:plan-only\]/, ']');
  assert.equal((await adapter.loadMap(mapId)).map.mode, 'plan-only');
});

test('an agent drops a blocker in its file: the signed blockers apply', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j, x } = await trail(root);
  edit(root, `${mapId}/tickets/${x}.md`, /^blocked_by: \[.*\]$/m, 'blocked_by: []');
  const snap = await adapter.loadMap(mapId);
  assert.deepEqual(snap.tickets.find((t) => t.id === x)!.blockedBy, [j]);
  assert.notEqual(deriveStates(snap.tickets, snap.map.mode).get(x), 'frontier', 'not ready to claim');
});

test('a free-text edit of a title is allowed, and marked as edited outside Teamtrail', async () => {
  const root = tmpRoot();
  const { adapter, mapId, x } = await trail(root);
  edit(root, `${mapId}/tickets/${x}.md`, /^title: .*$/m, 'title: Build it well');
  const t = await ticketOf(adapter, mapId, x);
  assert.equal(t.title, 'Build it well');
  assert.equal(t.status, undefined, 'not held');
  const out = outsideChanges(root);
  assert.equal(out.changes.length, 0, 'nothing waits for the human');
  assert.deepEqual(
    out.textEdits.map((e) => e.id),
    [x],
  );
});

test('the human accepts an outside change: it counts', async () => {
  const root = tmpRoot();
  const { adapter, mapId, x } = await trail(root);
  edit(root, `${mapId}/tickets/${x}.md`, /^blocked_by: \[.*\]$/m, 'blocked_by: []');
  const item = pendingTrust(root).find((i) => i.kind === 'state' && i.ticketId === x)!;
  assert.match(item.lines.join('\n'), /blocked_by/);
  const r = approveTrust({ root, items: [{ key: item.key, hash: item.hash }], by: 'trail lead' });
  assert.deepEqual(r.approved, [item.key]);
  assert.deepEqual((await ticketOf(adapter, mapId, x)).blockedBy, []);
  assert.equal(outsideChanges(root).changes.length, 0);
});

test('the human reverts an outside change: the file gets the signed values back', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  const file = `${mapId}/tickets/${j}.md`;
  edit(root, file, /^state: open$/m, 'state: closed');
  const item = pendingTrust(root).find((i) => i.kind === 'state' && i.ticketId === j)!;
  assert.throws(() => revertState({ root, key: item.key, hash: 'sha256:other', by: 'trail lead' }), /changed/);
  revertState({ root, key: item.key, hash: item.hash, by: 'trail lead' });
  assert.match(readFileSync(path.join(root, file), 'utf8'), /^state: open$/m);
  assert.equal(outsideChanges(root).changes.length, 0);
  assert.equal((await ticketOf(adapter, mapId, j)).status, undefined);
});

test('first run (and the upgrade): existing trails are adopted together, but only what is committed', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signed-git-'));
  const root = path.join(repo, '.teamtrail');
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  const one = await trail(root);
  const two = await trail(root, 'plan+execute', 'Second');
  // A clone on a new machine: the files are there, nothing is signed here.
  edit(root, `${one.mapId}/tickets/${one.j}.md`, /^state: open$/m, 'state: closed');
  git('add', '-A');
  git('commit', '-qm', 'trail');
  rmSync(path.dirname(stateRecordFile(root, one.mapId)), { recursive: true, force: true });
  // an upgrade: this machine approved other things before trail state was signed
  trustLedger(root).set({ checks: { hash: 'sha256:x', at: 1, by: 'trail lead' } });
  edit(root, `${two.mapId}/tickets/${two.x}.md`, /^assignee: .*$/m, 'assignee: claude-09');
  const items = await withCommitted(
    root,
    pendingTrust(root).filter((i) => i.kind === 'state'),
  );
  const first = items.find((i) => i.mapId === one.mapId)!;
  const second = items.find((i) => i.mapId === two.mapId)!;
  assert.equal(first.committed, true);
  assert.equal(second.committed, false, 'a file in it changed since the commit');
  const r = await approveTogether({ root, items: items.map((i) => ({ key: i.key, hash: i.hash })), by: 'trail lead' });
  assert.deepEqual(r.approved, [first.key]);
  assert.deepEqual(r.refused, [second.key]);
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  assert.equal((await ticketOf(adapter, one.mapId, one.j)).state, 'closed');
  const held = await ticketOf(adapter, two.mapId, two.x);
  assert.equal(held.assignee, undefined);
  assert.equal(held.status, 'blocked', 'nobody signed it, and the project has signed state now: held');
  // after that, outside changes are accepted one at a time
  edit(root, `${one.mapId}/tickets/${one.j}.md`, /^assignee: .*$/m, 'assignee: claude-07');
  git('commit', '-qam', 'claim');
  const later = await withCommitted(
    root,
    pendingTrust(root).filter((i) => i.kind === 'state'),
  );
  const again = await approveTogether({
    root,
    items: later.map((i) => ({ key: i.key, hash: i.hash })),
    by: 'trail lead',
  });
  assert.deepEqual(again.approved, []);
});

test('several processes writing at once lose no record', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await trail(root);
  const self = fileURLToPath(import.meta.url);
  const run = (who: string) =>
    new Promise<number>((resolve) => {
      const child = spawn(process.execPath, [self], {
        env: { ...process.env, SIGNED_STATE_WORKER: `${root}|${mapId}|${who}` },
        stdio: 'inherit',
      });
      child.on('exit', (code) => resolve(code ?? 1));
    });
  const codes = await Promise.all(['a', 'b', 'c', 'd'].map(run));
  assert.deepEqual(codes, [0, 0, 0, 0]);
  const snap = await adapter.loadMap(mapId);
  assert.equal(snap.tickets.length, 2 + 4 * 6);
  assert.equal(outsideChanges(root).changes.length, 0, 'every write was recorded');
  assert.ok(snap.tickets.every((t) => t.status !== 'blocked'));
});

test('an unreadable record means nothing is signed, and says why', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  await claim(adapter, mapId, j, { assignee: 'claude-01' });
  const file = stateRecordFile(root, mapId);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/"sig": "[0-9a-f]+"/, `"sig": "${'0'.repeat(64)}"`));
  const t = await ticketOf(adapter, mapId, j);
  assert.equal(t.assignee, undefined, 'the claim is not trusted');
  const out = outsideChanges(root);
  assert.match(out.problems.join('\n'), /can't be read|not signed/);
  assert.ok(out.changes.some((c) => c.id === j));
});
