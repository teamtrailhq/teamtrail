import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { journalFile } from '../src/history/journalFile';
import { ROLES_JOURNAL } from '../src/model/lifecycle';
import type { InstalledRole } from '../src/model/role';
import { chartMap } from '../src/planning/operations/chart';
import { readRoleLock } from '../src/roles/roleLock';
import { readVerificationConfig } from '../src/verification/configFile';
import { fakeRoleCatalog, roleText } from './fakes/roleCatalog';

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let root: string;
let catalog: Awaited<ReturnType<typeof fakeRoleCatalog>>;
const A11Y = roleText({ id: 'a11y', extra: 'proposedChecks:\n  a11y:\n    run: [npx, pa11y-ci]' });

before(async () => {
  root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-role-routes-')), 'repo', '.teamtrail');
  mkdirSync(path.join(root, 'roles'), { recursive: true });
  catalog = await fakeRoleCatalog({ a11y: A11Y }, { repo: 'https://github.com/teamtrailhq/teamtrail-guides' });
  writeFileSync(
    path.join(root, 'roles.json'),
    JSON.stringify({ v: 1, registries: [{ name: 'test', url: catalog.url }] }),
  );
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
type View = { roles: InstalledRole[]; error?: string };
const roleIn = (v: View, id: string) => v.roles.find((r) => r.id === id);

test('a file dropped into roles/ waits for approval; the trail lead approves it, journaled', async () => {
  writeFileSync(path.join(root, 'roles', 'docs2.md'), roleText({ id: 'docs2' }));
  const before = await call<View>('GET', '/roles');
  assert.equal(roleIn(before.json, 'docs2')?.status, 'unapproved');
  const approved = await call<View>('POST', '/roles/approve', { id: 'docs2' });
  assert.equal(approved.status, 200);
  assert.equal(roleIn(approved.json, 'docs2')?.status, 'active');
  assert.equal(readRoleLock(root).roles.docs2.source, 'local');
  const missing = await call<View>('POST', '/roles/approve', { id: 'nope' });
  assert.equal(missing.status, 409);
  assert.deepEqual(
    journalFile(root)
      .readRoles(ROLES_JOURNAL)
      .map((e) => [e.action, e.role, e.actor]),
    [['approved', 'docs2', 'trail lead']],
  );
});

test('catalog: list, preview without writing, add and pin, then approve its check', async () => {
  const list = await call<{ roles: { id: string }[]; repo: string }>('GET', '/roles/catalog');
  assert.deepEqual(
    list.json.roles.map((r) => r.id),
    ['a11y'],
  );
  assert.equal(list.json.repo, 'https://github.com/teamtrailhq/teamtrail-guides');
  const preview = await call<{ ok: boolean; text: string }>('GET', '/roles/catalog/preview?id=a11y');
  assert.equal(preview.json.ok, true);
  assert.equal(readRoleLock(root).roles.a11y, undefined, 'a preview writes nothing');
  const added = await call<View & { installed: { pendingChecks: string[] } }>('POST', '/roles/catalog/add', {
    id: 'a11y',
  });
  assert.deepEqual(added.json.installed.pendingChecks, ['a11y']);
  assert.equal(readVerificationConfig(root).exists, false, 'no command before approval');
  const approved = await call<View>('POST', '/roles/checks/approve', { id: 'a11y', name: 'a11y' });
  assert.deepEqual(roleIn(approved.json, 'a11y')?.pendingChecks, []);
  assert.deepEqual(readVerificationConfig(root).config?.checks.a11y.run, ['npx', 'pa11y-ci']);
});

test("a ticket's role and a trail's team: only active roles that fit; journaled on the trail", async () => {
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  const sections = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };
  const { map, tickets } = await chartMap(adapter, {
    title: 'Team',
    sections,
    tickets: [{ ref: 'a', title: 'Decide', type: 'junction', body: '' }],
  });
  const bad = await call<View>('POST', '/roles/ticket', { mapId: map.id, ticketId: tickets[0].id, role: 'qa' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error!, /not junction/);
  const ok = await call('POST', '/roles/ticket', { mapId: map.id, ticketId: tickets[0].id, role: 'architect' });
  assert.equal(ok.status, 200);
  const team = await call('POST', '/roles/team', { mapId: map.id, roles: ['architect', 'reviewer'] });
  assert.equal(team.status, 200);
  const snap = await adapter.loadMap(map.id);
  assert.equal(snap.tickets[0].role, 'architect');
  assert.deepEqual(snap.map.roles, ['architect', 'reviewer']);
  assert.deepEqual(
    journalFile(root)
      .readRoles(map.id)
      .map((e) => e.action),
    ['ticket-role', 'team'],
  );
});
