import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge } from '../src/bridge';
import { deriveStates } from '../src/planning/derive';
import { chartMap } from '../src/planning/operations/chart';
import { claim } from '../src/planning/operations/claims';
import { recordDecision } from '../src/planning/operations/decisionOps';
import { cachedFields, cachedText, cacheSizes, MAX_ENTRIES, MAX_ITEM_BYTES } from '../src/signedState/cachedFields';
import { lru } from '../src/signedState/lru';
import { outsideChanges } from '../src/signedState/outsideChanges';
import { revertState } from '../src/signedState/revertState';
import { stateItemOf } from '../src/signedState/stateItem';
import { readStateRecord, stateRecordFile } from '../src/signedState/stateRecord';
import { removeTrackerFile, trackerWriteHooks } from '../src/signedState/trackerFileWrite';
import { approveTogether } from '../src/trust/approveTogether';
import { approveTrust } from '../src/trust/approveTrust';
import { stateFirstRun } from '../src/trust/firstRun';
import { pendingTrust } from '../src/trust/pendingTrust';
import { contentHash } from '../src/trust/trustLedger';
import { withCommitted } from '../src/trust/withCommitted';

/*
 * Findings of the signed-state review, each as the probe that showed it: an agent (or a teammate's push) working on
 * the tracker files directly, a stale writer, or a device on the network.
 */

const SECTIONS = {
  destination: 'D',
  notes: '',
  decisions: [],
  unspecified: [],
  outOfScope: [],
  assumptions: [{ id: 'S-1', text: 'The store is local', status: 'challenged' as const, tickets: [] }],
};

const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signed-review-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};

const adapterOf = (root: string, by = 'agent claude-01') =>
  new MarkdownAdapter({ ...nodeMarkdownFs(root, { by }), watch: undefined }, root);

async function trail(root: string) {
  const adapter = adapterOf(root);
  const { map, tickets } = await chartMap(adapter, {
    title: 'Trail',
    sections: SECTIONS,
    tickets: [
      { ref: 'j', title: 'Pick the store', type: 'junction', body: 'Which store?' },
      { ref: 't', title: 'Ship it', type: 'task', body: 'Needs you.', hitl: true, blockedBy: ['j'] },
    ],
  });
  return { adapter, mapId: map.id, j: tickets[0].id, t: tickets[1].id };
}

function edit(root: string, rel: string, from: RegExp | string, to: string) {
  const file = path.join(root, rel);
  const text = readFileSync(file, 'utf8');
  const next = text.replace(from, to);
  assert.notEqual(next, text, `the edit applies to ${rel}`);
  writeFileSync(file, next);
}

const ticketOf = async (a: MarkdownAdapter, mapId: string, id: string) =>
  (await a.loadMap(mapId)).tickets.find((t) => t.id === id)!;

test('1: a trail renamed outside Teamtrail, its hitl label and blockers dropped: old one removed, new one held', async () => {
  const root = tmpRoot();
  const { mapId, t } = await trail(root);
  renameSync(path.join(root, mapId), path.join(root, 'trail-b'));
  edit(root, `trail-b/tickets/${t}.md`, /^blocked_by: \[.*\]$/m, 'blocked_by: []');
  edit(root, `trail-b/tickets/${t}.md`, /, teamtrail:hitl/, '');
  const out = outsideChanges(root).changes;
  assert.ok(
    out.some((c) => c.mapId === mapId && c.kind === 'map' && c.trail),
    'the old trail is removed',
  );
  assert.ok(
    out.some((c) => c.mapId === 'trail-b' && c.fields[0] === 'added'),
    'the new one was added outside',
  );
  const snap = await adapterOf(root).loadMap('trail-b');
  const moved = snap.tickets.find((x) => x.id === t)!;
  assert.equal(moved.status, 'blocked', 'held until the human accepts it');
  assert.equal(moved.type, 'junction', 'at least as strict as a junction');
  assert.notEqual(deriveStates(snap.tickets, snap.map.mode).get(t), 'frontier', 'not claimable');
  const items = pendingTrust(root).filter((i) => i.kind === 'state');
  const added = items.find((i) => i.mapId === 'trail-b')!;
  assert.match(added.title, /Trail trail-b added outside Teamtrail/);
  assert.equal(added.revert, 'none');
  // accepting the old trail's removal forgets it; accepting the new one signs it as shown, in one look
  const gone = items.find((i) => i.mapId === mapId)!;
  approveTrust({ root, items: [{ key: gone.key, hash: gone.hash }], by: 'trail lead' });
  approveTrust({ root, items: [{ key: added.key, hash: added.hash }], by: 'trail lead' });
  assert.deepEqual(outsideChanges(root).changes, []);
  assert.deepEqual((await ticketOf(adapterOf(root), 'trail-b', t)).blockedBy, []);
});

test('2: a ticket file copied in with no blockers is held until accepted, and Teamtrail does not write to it', async () => {
  const root = tmpRoot();
  const { mapId, t } = await trail(root);
  const rel = `${mapId}/tickets/99.md`;
  copyFileSync(path.join(root, `${mapId}/tickets/${t}.md`), path.join(root, rel));
  edit(root, rel, /^id: .*$/m, 'id: 99');
  edit(root, rel, /^blocked_by: \[.*\]$/m, 'blocked_by: []');
  const adapter = adapterOf(root);
  const copy = await ticketOf(adapter, mapId, '99');
  assert.equal(copy.status, 'blocked');
  assert.equal(copy.type, 'junction');
  await assert.rejects(claim(adapter, mapId, '99', { assignee: 'claude-01' }));
  await assert.rejects(adapter.comment(mapId, '99', 'claude-01', 'hi'), /isn't signed here/);
  const item = pendingTrust(root).find((i) => i.kind === 'state' && i.ticketId === '99')!;
  assert.match(item.title, /Ticket added outside Teamtrail/);
  assert.match(item.lines.join('\n'), /#99: type task/);
  approveTrust({ root, items: [{ key: item.key, hash: item.hash }], by: 'trail lead' });
  const accepted = await ticketOf(adapter, mapId, '99');
  assert.equal(accepted.status, undefined);
  assert.equal(accepted.type, 'task');
});

test('3: bulk adoption ends at the first signed write, and never adopts a change to what this machine signed', async () => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signed-review-git-'));
  const root = path.join(repo, '.teamtrail');
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
  git('init', '-q');
  git('config', 'user.email', 't@example.com');
  git('config', 'user.name', 't');
  const { adapter, mapId, j, t } = await trail(root);
  assert.equal(stateFirstRun(root), false, 'Teamtrail signed the trail it charted');
  // the probe: an agent drops a signed ticket's hitl label and blocker, commits, and asks for adoption
  edit(root, `${mapId}/tickets/${t}.md`, /^blocked_by: \[.*\]$/m, 'blocked_by: []');
  edit(root, `${mapId}/tickets/${t}.md`, /, teamtrail:hitl/, '');
  edit(root, `${mapId}/tickets/${j}.md`, /^state: open$/m, 'state: closed');
  git('add', '-A');
  git('commit', '-qm', 'unblock');
  const items = await withCommitted(
    root,
    pendingTrust(root).filter((i) => i.kind === 'state'),
  );
  assert.equal(items.length, 2);
  const r = await approveTogether({ root, items: items.map((i) => ({ key: i.key, hash: i.hash })), by: 'x' });
  assert.deepEqual(r.approved, []);
  const held = await ticketOf(adapter, mapId, t);
  assert.deepEqual(held.blockedBy, [j]);
  assert.equal(held.hitl, true);
  // a fresh clone: the first signed write ends the first run too, before anything is accepted
  rmSync(path.dirname(stateRecordFile(root, mapId)), { recursive: true, force: true });
  assert.equal(stateFirstRun(root), true);
  await adapterOf(root).createMap({ title: 'Another', sections: SECTIONS });
  assert.equal(stateFirstRun(root), false);
});

test('4: Revert and Teamtrail writes never go through a symbolic link', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  const outside = path.join(path.dirname(root), 'outside.md');
  const rel = `${mapId}/tickets/${j}.md`;
  const before = readFileSync(path.join(root, rel), 'utf8');
  rmSync(path.join(root, rel));
  symlinkSync(outside, path.join(root, rel));
  const item = pendingTrust(root).find((i) => i.kind === 'state' && i.ticketId === j)!;
  assert.throws(() => revertState({ root, key: item.key, hash: item.hash, by: 'trail lead' }), /symbolic link/);
  assert.equal(existsSync(outside), false, 'nothing was created outside the repo');
  // a link to a file outside the repo that reads as the ticket: Teamtrail still won't write through it
  writeFileSync(outside, before);
  await assert.rejects(adapter.comment(mapId, j, 'claude-01', 'hi'), /symbolic link/);
  assert.equal(readFileSync(outside, 'utf8'), before);
});

test('5: a stale writer neither undoes nor re-signs a change it never saw', async () => {
  const root = tmpRoot();
  const { mapId, j } = await trail(root);
  const fs = nodeMarkdownFs(root, { by: 'agent a' });
  const rel = `${mapId}/tickets/${j}.md`;
  const base = await fs.read(rel);
  await claim(adapterOf(root, 'agent b'), mapId, j, { assignee: 'claude-02' });
  // a change to another field merges: the claim made in between stays
  await fs.write(rel, base.replace(/^title: .*$/m, 'title: Pick the store, again'), { base });
  const t = await ticketOf(adapterOf(root), mapId, j);
  assert.equal(t.assignee, 'claude-02');
  assert.equal(t.title, 'Pick the store, again');
  // a change to the same field is refused
  const clash = base.replace(/^assignee: .*$/m, 'assignee: claude-01');
  await assert.rejects(fs.write(rel, clash, { base }), (e: Error & { stale?: boolean }) => e.stale === true);
  assert.equal((await ticketOf(adapterOf(root), mapId, j)).assignee, 'claude-02');
  assert.deepEqual(outsideChanges(root).changes, []);
});

test('5: PUT /file with an If-Match that no longer matches answers 409, and writes nothing', async () => {
  const root = tmpRoot();
  const { mapId, j } = await trail(root);
  const bridge = createTrackerBridge(root, { env: {}, cwd: path.dirname(root) });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/file?path=${mapId}/tickets/${j}.md`;
  try {
    const loaded = await fetch(url);
    const etag = loaded.headers.get('etag')!;
    const text = await loaded.text();
    assert.equal(etag, `"${contentHash(text)}"`);
    await claim(adapterOf(root, 'agent b'), mapId, j, { assignee: 'claude-02' });
    const put = await fetch(url, {
      method: 'PUT',
      body: text.replace('Which store?', 'x'),
      headers: { 'If-Match': etag },
    });
    assert.equal(put.status, 409);
    assert.equal(((await put.json()) as { stale?: boolean }).stale, true);
    assert.equal((await ticketOf(adapterOf(root), mapId, j)).assignee, 'claude-02');
    const fresh = await fetch(url);
    const ok = await fetch(url, {
      method: 'PUT',
      body: (await fresh.text()).replace('Which store?', 'x'),
      headers: { 'If-Match': fresh.headers.get('etag')! },
    });
    assert.equal(ok.status, 200);
  } finally {
    bridge.close();
    server.closeAllConnections();
    server.close();
  }
});

test('6: a decision’s rationale edited outside Teamtrail is a change, shown as it was and as it is', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  const d = await recordDecision(adapter, mapId, {
    ticketId: j,
    question: 'Which store?',
    answer: 'SQLite',
    rationale: 'It is local.',
    decidedBy: 'claude-01',
    source: { kind: 'agent' },
  });
  edit(root, `${mapId}/decisions/${d.id}.md`, 'It is local.', 'The trail lead insisted.');
  const change = outsideChanges(root).changes.find((c) => c.id === d.id)!;
  assert.deepEqual(change.fields, ['words']);
  const item = pendingTrust(root).find((i) => i.key.endsWith(`decision:${d.id}`))!;
  assert.match(item.lines.join('\n'), /rationale:\n- It is local\.\n\+ The trail lead insisted\./);
  const [read] = await adapter.listDecisions(mapId);
  assert.equal(read.rationale, 'It is local.', 'the signed words count');
});

test('9: an assumption line deleted outside Teamtrail is a change; it still counts, and Revert puts it back', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await trail(root);
  edit(root, `${mapId}/map.md`, /^.*S-1.*\n/m, '');
  const change = outsideChanges(root).changes.find((c) => c.kind === 'map')!;
  assert.deepEqual(change.fields, ['assumption:S-1']);
  const snap = await adapter.loadMap(mapId);
  assert.equal(snap.map.sections.assumptions?.[0]?.status, 'challenged');
  const item = pendingTrust(root).find((i) => i.kind === 'state' && i.key.endsWith(':map'))!;
  revertState({ root, key: item.key, hash: item.hash, by: 'trail lead' });
  assert.match(readFileSync(path.join(root, `${mapId}/map.md`), 'utf8'), /S-1/);
  assert.deepEqual(outsideChanges(root).changes, []);
});

test('9: a file over the size limit is not read: it is a change, and a signed ticket in it still blocks', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j, t } = await trail(root);
  writeFileSync(path.join(root, `${mapId}/tickets/${j}.md`), 'x'.repeat(MAX_ITEM_BYTES + 1));
  const change = outsideChanges(root).changes.find((c) => c.id === j)!;
  assert.deepEqual(change.fields, ['oversized']);
  const snap = await adapter.loadMap(mapId);
  assert.equal(snap.tickets.find((x) => x.id === j)?.status, 'blocked');
  assert.notEqual(deriveStates(snap.tickets, snap.map.mode).get(t), 'frontier');
});

test('9: a decision file that cannot be read is said, not dropped in silence', async (ctx) => {
  if (process.getuid?.() === 0) return ctx.skip('root reads everything');
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  const d = await recordDecision(adapter, mapId, {
    ticketId: j,
    question: 'Which store?',
    answer: 'SQLite',
    decidedBy: 'claude-01',
    source: { kind: 'agent' },
  });
  const file = path.join(root, `${mapId}/decisions/${d.id}.md`);
  chmodSync(file, 0o000);
  const warned: string[] = [];
  const warn = console.warn;
  console.warn = (msg: string) => void warned.push(msg);
  try {
    assert.deepEqual(await adapterOf(root).listDecisions(mapId), []);
  } finally {
    console.warn = warn;
    chmodSync(file, 0o644);
  }
  assert.match(warned.join('\n'), new RegExp(`${d.id}.md can't be read`));
});

test('9: with its record unreadable, a decision is never offered for deletion; deleting one names the file', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  const d = await recordDecision(adapter, mapId, {
    ticketId: j,
    question: 'Which store?',
    answer: 'SQLite',
    decidedBy: 'claude-01',
    source: { kind: 'agent' },
  });
  const forged = readFileSync(path.join(root, `${mapId}/decisions/${d.id}.md`), 'utf8').replace(
    `id: ${d.id}`,
    'id: D-9',
  );
  writeFileSync(path.join(root, `${mapId}/decisions/D-9.md`), forged);
  const added = pendingTrust(root).find((i) => i.key.endsWith('decision:D-9'))!;
  assert.equal(added.revert, 'delete');
  assert.throws(() => revertState({ root, key: added.key, hash: added.hash, by: 'trail lead' }), /Name the files/);
  const file = `${mapId}/decisions/D-9.md`;
  revertState({ root, key: added.key, hash: added.hash, by: 'trail lead', remove: [file] });
  assert.equal(existsSync(path.join(root, file)), false);
  // the record can't be read now: the real decision reads as one nobody signed, and is never offered for deletion
  writeFileSync(stateRecordFile(root, mapId), '{}');
  const real = pendingTrust(root).find((i) => i.key.endsWith(`decision:${d.id}`))!;
  assert.equal(real.revert, 'none');
  assert.throws(() => revertState({ root, key: real.key, hash: real.hash, by: 'trail lead', remove: [real.file!] }));
  assert.ok(existsSync(path.join(root, `${mapId}/decisions/${d.id}.md`)));
});

test('#62: a trail’s mode set to plan-only in its file is held as an outside change; the signed mode applies', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await trail(root);
  edit(root, `${mapId}/map.md`, /^mode: plan\+execute$/m, 'mode: plan-only');
  assert.equal((await adapter.loadMap(mapId)).map.mode, 'plan+execute');
  const change = outsideChanges(root).changes.find((c) => c.kind === 'map')!;
  assert.deepEqual(change.fields, ['mode']);
});

test('#62: a destination rewritten in map.md is held: it reads as signed, shows before and after, and reverts', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await trail(root);
  const rel = `${mapId}/map.md`;
  edit(root, rel, /^D$/m, 'Somewhere else entirely');
  assert.equal((await adapter.loadMap(mapId)).map.sections.destination, 'D');
  const change = outsideChanges(root).changes.find((c) => c.kind === 'map')!;
  assert.deepEqual(change.fields, ['destination']);
  const item = pendingTrust(root).find((i) => i.kind === 'state' && i.key.endsWith(':map'))!;
  assert.match(item.lines.join('\n'), /destination:\n- D\n\+ Somewhere else entirely/);
  revertState({ root, key: item.key, hash: item.hash, by: 'trail lead' });
  assert.match(readFileSync(path.join(root, rel), 'utf8'), /^D$/m);
  assert.deepEqual(outsideChanges(root).changes, []);
  // accepted instead, the new destination is the signed one from then on
  edit(root, rel, /^D$/m, 'Accepted elsewhere');
  const again = pendingTrust(root).find((i) => i.kind === 'state' && i.key.endsWith(':map'))!;
  approveTrust({ root, items: [{ key: again.key, hash: again.hash }], by: 'trail lead' });
  assert.equal((await adapter.loadMap(mapId)).map.sections.destination, 'Accepted elsewhere');
  assert.deepEqual(outsideChanges(root).changes, []);
});

test('#62: a ticket’s type and hitl label edited in its file: gates read the signed ones', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j, t } = await trail(root);
  edit(root, `${mapId}/tickets/${j}.md`, /^type: junction$/m, 'type: task');
  edit(root, `${mapId}/tickets/${t}.md`, /, teamtrail:hitl/, '');
  const snap = await adapter.loadMap(mapId);
  assert.equal(snap.tickets.find((x) => x.id === j)!.type, 'junction');
  assert.equal(snap.tickets.find((x) => x.id === t)!.hitl, true);
  const fields = outsideChanges(root).changes.map((c) => [c.id, c.fields]);
  assert.deepEqual(fields.sort(), [
    [j, ['type']],
    [t, ['hitl']],
  ]);
});

test('9: the caches keep at most their cap, dropping the least recently used first', () => {
  const cache = lru<number>(3);
  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), 1, 'a is now the newest');
  cache.set('d', 4);
  assert.equal(cache.get('b'), undefined, 'b was the least recently used');
  assert.deepEqual([cache.get('a'), cache.get('c'), cache.get('d'), cache.size], [1, 3, 4, 3]);
  // and the file caches stay within theirs however many files a project has
  const dir = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-signed-cap-'));
  for (let i = 0; i <= MAX_ENTRIES + 10; i++) {
    const file = path.join(dir, `${i}.md`);
    writeFileSync(file, `---\nid: "${i}"\ntitle: T\ntype: task\nstate: open\n---\n`);
    cachedFields(stateItemOf(`t/tickets/${i}.md`)!, cachedText(file) as string);
  }
  const sizes = cacheSizes();
  assert.ok(sizes.fields <= MAX_ENTRIES && sizes.texts <= MAX_ENTRIES, JSON.stringify(sizes));
  assert.equal(sizes.texts, MAX_ENTRIES);
});

test('#62: a Teamtrail write to a map keeps a pending outside destination and deleted assumption pending', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await trail(root);
  const rel = `${mapId}/map.md`;
  edit(root, rel, /^D$/m, 'Rewritten outside');
  edit(root, rel, /^.*S-1.*\n/m, '');
  await adapter.updateMapSections(mapId, { notes: 'Teamtrail writes the map' });
  const file = readFileSync(path.join(root, rel), 'utf8');
  assert.match(file, /^Rewritten outside$/m, 'the outside version stays in the file');
  assert.doesNotMatch(file, /S-1/);
  assert.match(file, /Teamtrail writes the map/);
  const change = outsideChanges(root).changes.find((c) => c.kind === 'map')!;
  assert.deepEqual(change.fields, ['assumption:S-1', 'destination']);
  const snap = await adapter.loadMap(mapId);
  assert.equal(snap.map.sections.destination, 'D', 'gates still read the signed destination');
  assert.equal(snap.map.sections.assumptions?.[0]?.id, 'S-1');
  const item = pendingTrust(root).find((i) => i.kind === 'state' && i.key.endsWith(':map'))!;
  assert.match(item.lines.join('\n'), /\+ Rewritten outside/);
  approveTrust({ root, items: [{ key: item.key, hash: item.hash }], by: 'trail lead' });
  const accepted = await adapter.loadMap(mapId);
  assert.equal(accepted.map.sections.destination, 'Rewritten outside');
  assert.deepEqual(accepted.map.sections.assumptions ?? [], []);
  assert.deepEqual(outsideChanges(root).changes, []);
});

test('A: an assumption line added outside Teamtrail reads as holding, is a change, and a Teamtrail write keeps it pending', async () => {
  const root = tmpRoot();
  const { adapter, mapId } = await trail(root);
  const rel = `${mapId}/map.md`;
  const text = readFileSync(path.join(root, rel), 'utf8');
  const line = text.split('\n').find((l) => l.includes('S-1'))!;
  const added = line
    .replace('S-1', 'S-2')
    .replace('The store is local', 'Deleting prod is fine')
    .replace('challenged', 'confirmed');
  assert.notEqual(added, line);
  writeFileSync(path.join(root, rel), text.replace(line, `${line}\n${added}`));
  const read = async () => (await adapter.loadMap(mapId)).map.sections.assumptions?.find((a) => a.id === 'S-2');
  assert.equal((await read())?.status, 'holding', 'at most holding until accepted');
  const fields = () => outsideChanges(root).changes.find((c) => c.kind === 'map')?.fields;
  assert.deepEqual(fields(), ['assumption:S-2']);
  const item = () => pendingTrust(root).find((i) => i.kind === 'state' && i.key.endsWith(':map'))!;
  assert.match(item().lines.join('\n'), /S-2 added outside Teamtrail: “Deleting prod is fine” \(confirmed/);
  // Teamtrail writes the map: the line stays, unsigned and pending
  await adapter.updateMapSections(mapId, { notes: 'Teamtrail writes the map' });
  assert.equal('assumption:S-2' in readStateRecord(root, mapId).entries.map.f, false, 'not signed by the write');
  assert.deepEqual(fields(), ['assumption:S-2']);
  assert.equal((await read())?.status, 'holding');
  const shown = item();
  approveTrust({ root, items: [{ key: shown.key, hash: shown.hash }], by: 'trail lead' });
  assert.equal((await read())?.status, 'confirmed', 'accepted, it counts as written');
});

test('C: a folder swapped for a link between the check and the write: nothing lands outside the repo', async () => {
  const root = tmpRoot();
  const { adapter, mapId, j } = await trail(root);
  const outside = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-outside-'));
  const tickets = path.join(root, mapId, 'tickets');
  trackerWriteHooks.afterCheck = () => {
    trackerWriteHooks.afterCheck = undefined;
    renameSync(tickets, `${tickets}.moved`);
    symlinkSync(outside, tickets);
  };
  try {
    await assert.rejects(adapter.comment(mapId, j, 'claude-01', 'hi'), /symbolic link/);
  } finally {
    trackerWriteHooks.afterCheck = undefined;
  }
  assert.deepEqual(readdirSync(outside), [], 'what went through the link was removed');
  // and removal: a folder swapped the same way never deletes outside the repo
  rmSync(tickets);
  renameSync(`${tickets}.moved`, tickets);
  writeFileSync(path.join(outside, `${j}.md`), 'keep me');
  trackerWriteHooks.afterCheck = () => {
    trackerWriteHooks.afterCheck = undefined;
    renameSync(tickets, `${tickets}.moved`);
    symlinkSync(outside, tickets);
  };
  try {
    assert.throws(() => removeTrackerFile(root, `${mapId}/tickets/${j}.md`), /symbolic link/);
  } finally {
    trackerWriteHooks.afterCheck = undefined;
  }
  assert.equal(readFileSync(path.join(outside, `${j}.md`), 'utf8'), 'keep me');
});

test('D: PUT /file with If-None-Match: * creates only a file that isn’t there (412 otherwise)', async () => {
  const root = tmpRoot();
  const { mapId, j } = await trail(root);
  const bridge = createTrackerBridge(root, { env: {}, cwd: path.dirname(root) });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/file?path=`;
  const put = (rel: string, body: string) =>
    fetch(base + encodeURIComponent(rel), { method: 'PUT', body, headers: { 'If-None-Match': '*' } });
  try {
    const taken = `${mapId}/tickets/${j}.md`;
    const before = readFileSync(path.join(root, taken), 'utf8');
    const clash = await put(taken, before.replace('Pick the store', 'Overwritten'));
    assert.equal(clash.status, 412);
    assert.equal(readFileSync(path.join(root, taken), 'utf8'), before, 'the agent’s ticket is untouched');
    const fresh = await put(`${mapId}/tickets/77.md`, before.replace(/^id: .*$/m, 'id: "77"'));
    assert.equal(fresh.status, 200);
    assert.ok(readStateRecord(root, mapId).entries['ticket:77'], 'created and signed');
  } finally {
    bridge.close();
    server.closeAllConnections();
    server.close();
  }
});
