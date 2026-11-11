import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { readGuideLock } from '../src/guides/guideLock';
import { journalFile } from '../src/history/journalFile';
import type { InstalledGuide } from '../src/model/guide';
import { GUIDES_JOURNAL } from '../src/model/lifecycle';
import { chartMap } from '../src/planning/operations/chart';
import { readVerificationConfig } from '../src/verification/configFile';
import { fakeGuideCatalog, guideText } from './fakes/guideCatalog';
import { approveAllHere } from './fakes/trailLead';

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let root: string;
let catalog: Awaited<ReturnType<typeof fakeGuideCatalog>>;
const A11Y = guideText({ id: 'a11y', extra: 'proposedChecks:\n  a11y:\n    run: [node_modules/.bin/pa11y-ci]' });

before(async () => {
  root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-guide-routes-')), 'repo', '.teamtrail');
  mkdirSync(path.join(root, 'guides'), { recursive: true });
  catalog = await fakeGuideCatalog({ a11y: A11Y }, { repo: 'https://github.com/teamtrailhq/teamtrail-guides' });
  writeFileSync(
    path.join(root, 'guides.json'),
    JSON.stringify({ v: 1, registries: [{ name: 'test', url: catalog.url }] }),
  );
  approveAllHere(root); // the trail lead approved this catalog on this machine
  bridge = createTrackerBridge(root, { env: {}, cwd: path.dirname(root) });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(async () => {
  bridge.close();
  server.close();
  await catalog.close();
});

const call = async <T>(method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as T };
};
type View = { guides: InstalledGuide[]; error?: string };
const guideIn = (v: View, id: string) => v.guides.find((r) => r.id === id);

test('a file dropped into guides/ waits for approval; the trail lead approves it, journaled', async () => {
  writeFileSync(path.join(root, 'guides', 'docs2.md'), guideText({ id: 'docs2' }));
  const before = await call<View>('GET', '/guides');
  assert.equal(guideIn(before.json, 'docs2')?.status, 'unapproved');
  // approving names the hash of the text the page showed: without it, or for a text swapped in since, nothing happens
  const unshown = await call<View>('POST', '/guides/approve', { id: 'docs2' });
  assert.equal(unshown.status, 400);
  const stale = await call<View>('POST', '/guides/approve', { id: 'docs2', sha256: `sha256:${'0'.repeat(64)}` });
  assert.equal(stale.status, 409);
  assert.match(stale.json.error ?? '', /changed since it was shown/);
  const sha256 = guideIn(before.json, 'docs2')?.sha256;
  const approved = await call<View>('POST', '/guides/approve', { id: 'docs2', sha256 });
  assert.equal(approved.status, 200);
  assert.equal(guideIn(approved.json, 'docs2')?.status, 'active');
  assert.equal(readGuideLock(root).guides.docs2.source, 'local');
  const missing = await call<View>('POST', '/guides/approve', { id: 'nope', sha256 });
  assert.equal(missing.status, 409);
  assert.deepEqual(
    journalFile(root)
      .readGuides(GUIDES_JOURNAL)
      .map((e) => [e.action, e.guide, e.actor]),
    [['approved', 'docs2', 'trail lead']],
  );
});

test('catalog: list, preview without writing, add and pin, then approve its check', async () => {
  const list = await call<{ guides: { id: string }[]; repo: string }>('GET', '/guides/catalog');
  assert.deepEqual(
    list.json.guides.map((r) => r.id),
    ['a11y'],
  );
  assert.equal(list.json.repo, 'https://github.com/teamtrailhq/teamtrail-guides');
  const preview = await call<{ ok: boolean; text: string; entry: { sha256: string } }>(
    'GET',
    '/guides/catalog/preview?id=a11y',
  );
  assert.equal(preview.json.ok, true);
  assert.equal(readGuideLock(root).guides.a11y, undefined, 'a preview writes nothing');
  // adding approves the file the page showed: without its hash, or with another one, nothing is added
  assert.equal((await call('POST', '/guides/catalog/add', { id: 'a11y' })).status, 400);
  const other = await call<View>('POST', '/guides/catalog/add', { id: 'a11y', sha256: `sha256:${'0'.repeat(64)}` });
  assert.equal(other.status, 409);
  assert.match(other.json.error ?? '', /changed in the catalog since it was shown/);
  assert.equal(readGuideLock(root).guides.a11y, undefined);
  const added = await call<View & { installed: { pendingChecks: string[] } }>('POST', '/guides/catalog/add', {
    id: 'a11y',
    sha256: preview.json.entry.sha256,
  });
  assert.deepEqual(added.json.installed.pendingChecks, ['a11y']);
  assert.deepEqual(
    guideIn(added.json, 'a11y')?.lock?.review,
    { verified: true, reviewedBy: ['maintainer'] },
    "the catalog's review is pinned with it, so Settings needs no network",
  );
  assert.equal(readVerificationConfig(root).exists, false, 'no command before approval');
  const approved = await call<View>('POST', '/guides/checks/approve', { id: 'a11y', name: 'a11y' });
  assert.deepEqual(guideIn(approved.json, 'a11y')?.pendingChecks, []);
  assert.deepEqual(readVerificationConfig(root).config?.checks.a11y.run, ['node_modules/.bin/pa11y-ci']);
});

test("a ticket's guide and a trail's team: only active guides that fit; journaled on the trail", async () => {
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const sections = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
  const { map, tickets } = await chartMap(adapter, {
    title: 'Team',
    sections,
    tickets: [{ ref: 'a', title: 'Decide', type: 'junction', body: '' }],
  });
  const bad = await call<View>('POST', '/guides/ticket', { mapId: map.id, ticketId: tickets[0].id, guide: 'qa' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error!, /not junction/);
  const ok = await call('POST', '/guides/ticket', { mapId: map.id, ticketId: tickets[0].id, guide: 'architect' });
  assert.equal(ok.status, 200);
  const team = await call('POST', '/guides/team', { mapId: map.id, guides: ['architect', 'reviewer'] });
  assert.equal(team.status, 200);
  const snap = await adapter.loadMap(map.id);
  assert.equal(snap.tickets[0].guide, 'architect');
  assert.deepEqual(snap.map.guides, ['architect', 'reviewer']);
  assert.deepEqual(
    journalFile(root)
      .readGuides(map.id)
      .map((e) => e.action),
    ['ticket-guide', 'team'],
  );
});
