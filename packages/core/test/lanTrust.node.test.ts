import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';

/*
 * A device on the network (no sign-in yet) used to change what this machine trusts by writing tracker files:
 * `PUT /file?path=<trail>/map.md` with `verification: off`, a ticket's `checks`, a decision recorded as the
 * trail lead's. And `/tracker/<kind>/call` let it call setMapMeta on GitHub or Linear, even for a tracker that
 * isn't the active one. Now trust fields are this machine's only, whatever the route.
 */
let server: http.Server;
let bridge: TrackerBridge;
let port: number;
let root: string;
const LAN = { 'x-test-peer': '192.168.1.20' };
const peer = (req: http.IncomingMessage) => (req.headers['x-test-peer'] as string | undefined) ?? '127.0.0.1';

const MAP = `---\nkey: T\ntitle: Trail\nmode: auto\nverification: checks\nlabels: [teamtrail-map]\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n\n## Destination\n\nSomewhere\n`;
const TICKET = `---\nid: 1\ntitle: Build it\ntype: task\nstate: open\nlabels: [teamtrail]\nchecks: [lint]\ncreated: 2026-01-01T00:00:00.000Z\nupdated: 2026-01-01T00:00:00.000Z\n---\n\nThe body\n`;

before(async () => {
  root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-lantrust-')), 'repo', '.teamtrail');
  mkdirSync(path.join(root, 'trail', 'tickets'), { recursive: true });
  writeFileSync(path.join(root, 'trail', 'map.md'), MAP);
  writeFileSync(path.join(root, 'trail', 'tickets', '1.md'), TICKET);
  // GitHub is the project's tracker (no token here: a refused call never gets as far as needing one).
  writeFileSync(path.join(root, 'trackers.json'), JSON.stringify({ active: 'github', github: { repo: 'o/r' } }));
  bridge = createTrackerBridge(root, {
    env: {},
    configDir: path.join(root, '..', 'config'),
    cwd: path.dirname(root),
    peer,
  });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});
after(() => {
  bridge.close();
  server.closeAllConnections();
  server.close();
});

const put = async (rel: string, body: string, headers: Record<string, string> = LAN) =>
  (await fetch(`http://127.0.0.1:${port}/file?path=${encodeURIComponent(rel)}`, { method: 'PUT', headers, body }))
    .status;
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8');

test('a LAN device cannot change a trail’s or a ticket’s trust fields through the raw file route', async () => {
  for (const [rel, from, to] of [
    ['trail/map.md', 'verification: checks', 'verification: off'],
    ['trail/map.md', 'mode: auto', 'mode: auto\nmodel-matching: on'],
    ['trail/map.md', 'mode: auto', 'mode: auto\nguides: [qa]'],
    ['trail/tickets/1.md', 'checks: [lint]', 'checks: []'],
    ['trail/tickets/1.md', 'type: task', 'type: task\nverification: off'],
    ['trail/tickets/1.md', 'type: task', 'type: task\nguide: qa'],
    ['trail/tickets/1.md', 'type: task', 'type: task\nreview_of: "2"'],
    ['trail/tickets/1.md', 'type: task', 'type: task\nassignee: trail lead'],
  ] as const) {
    const before = read(rel);
    assert.equal(await put(rel, before.replace(from, to)), 403, `${rel}: ${to}`);
    assert.equal(read(rel), before);
  }
  // A trail created from there can't start with a trust field set either.
  assert.equal(await put('other/map.md', MAP.replace('verification: checks', 'verification: off')), 403);
});

test('a LAN device cannot write what records the human’s approval: decisions, briefs, criteria, knowledge, guides', async () => {
  for (const rel of [
    'trail/decisions/D-1.md',
    'briefs/trail.md',
    'criteria/trail.md',
    'knowledge/K-1.md',
    'guides/qa.md',
    'notes.md',
  ])
    assert.equal(await put(rel, '---\nstatus: accepted\ndecided_by: trail lead\n---\n'), 403, rel);
});

test('the same device still edits what is not trust: a comment, a title, the map body', async () => {
  const ticket = read('trail/tickets/1.md');
  assert.equal(await put('trail/tickets/1.md', ticket.replace('The body', 'The body, edited from a phone')), 200);
  const map = read('trail/map.md');
  assert.equal(await put('trail/map.md', map.replace('Somewhere', 'Somewhere else')), 200);
  // And this machine changes anything, as before.
  assert.equal(
    await put('trail/map.md', read('trail/map.md').replace('verification: checks', 'verification: off'), {}),
    200,
  );
});

test('/tracker/<kind>/call: trust changes are this machine’s, and only the active tracker is served', async () => {
  const call = (kind: string, method: string, args: unknown[], headers: Record<string, string> = LAN) =>
    fetch(`http://127.0.0.1:${port}/tracker/${kind}/call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ method, args }),
    }).then(async (r) => ({ status: r.status, text: await r.text() }));
  for (const [method, args] of [
    ['setMapMeta', ['m', { verification: 'off' }]],
    ['setMapMeta', ['m', { modelMatching: { enabled: true } }]],
    ['setMapMeta', ['m', { guides: ['qa'] }]],
    ['setMeta', ['m', '1', { checks: [] }]],
    ['setMeta', ['m', '1', { verification: 'off' }]],
    ['setMeta', ['m', '1', { guide: 'qa' }]],
    ['assign', ['m', '1', 'trail lead']],
    ['createMap', [{ title: 'x', sections: {}, verification: 'off' }]],
    ['createDecision', ['m', { decidedBy: 'trail lead' }]],
  ] as const) {
    const r = await call('github', method, [...args]);
    assert.equal(r.status, 403, `${method} ${JSON.stringify(args)}: ${r.text}`);
  }
  // Linear has nothing to do with this project: it isn't served, from anywhere.
  const inactive = await call('linear', 'listMaps', [], {});
  assert.equal(inactive.status, 409, inactive.text);
  assert.match(inactive.text, /not the tracker this project uses/);
});
