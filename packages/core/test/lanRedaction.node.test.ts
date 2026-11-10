import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import { lanPlaces } from '../src/server/lanPlaces';
import { lanRedactor, redactForLan } from '../src/server/redactForLan';

/*
 * What a device on the network may learn about this machine's disk: nothing. Reproduces the review's findings:
 * the /file route answered a missing file with `ENOENT … open '/absolute/path'`, redaction went by key name
 * (so `paths`, `repo`, `Path`, UNC paths and paths inside messages passed), and /events was not redacted.
 */
let server: http.Server;
let bridge: TrackerBridge;
let port: number;
let top: string;
let root: string;
const LAN = { 'x-test-peer': '192.168.1.20' };
const peer = (req: http.IncomingMessage) => (req.headers['x-test-peer'] as string | undefined) ?? '127.0.0.1';

before(async () => {
  top = realpathSync(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-lan-')));
  root = path.join(top, 'repo', '.teamtrail');
  mkdirSync(root, { recursive: true });
  bridge = createTrackerBridge(root, { env: {}, configDir: path.join(top, 'config'), cwd: path.dirname(root), peer });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as { port: number }).port;
});
after(() => {
  bridge.close();
  server.closeAllConnections();
  server.close();
});

const get = async (p: string, headers: Record<string, string> = {}) => {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, { headers });
  return { status: r.status, text: await r.text() };
};

test('a missing file is a plain 404, to this machine and to others: no ENOENT, no absolute path', async () => {
  for (const headers of [{}, LAN]) {
    const r = await get('/file?path=nope/tickets/1.md', headers);
    assert.equal(r.status, 404);
    assert.ok(!r.text.includes('ENOENT'), r.text);
    assert.ok(!r.text.includes(top), r.text);
    assert.ok(!r.text.includes(os.tmpdir()), r.text);
  }
  // a folder where a file was asked for is no different
  mkdirSync(path.join(root, 'trail', 'x.md'), { recursive: true });
  assert.equal((await get('/file?path=trail/x.md')).status, 404);
});

test('redaction goes by value: paths under the project, home or temp are shortened whatever the key', () => {
  const home = os.homedir();
  const places = lanRedactor([...lanPlaces(root), 'C:\\Users\\ada', '\\\\nas\\share\\ada']);
  const out = redactForLan(
    {
      paths: [path.join(top, 'repo', 'src', 'a.ts'), 'src/relative.ts'],
      repo: path.join(top, 'repo'),
      Path: '/opt/elsewhere/tool/bin',
      ROOT: 'D:\\work\\repo\\x',
      share: '\\\\nas\\share\\ada\\secrets\\k.txt',
      Dir: '\\\\other\\host\\a\\b',
      message: `ENOENT: no such file, open '${path.join(home, 'Code', 'app', 'x.md')}' (cwd ${top}/repo)`,
      win: 'failed at C:\\Users\\ada\\Code\\app\\x.md, retry',
      note: 'see /scout and docs/guide.md',
      [path.join(top, 'repo', 'keyed.ts')]: 1,
      account: '@me',
    },
    places,
  );
  const text = JSON.stringify(out);
  for (const secret of [top, home, 'C:\\\\Users', 'nas', '/opt/elsewhere', 'D:', 'other\\\\host', '@me'])
    assert.ok(!text.includes(secret), `${secret} in ${text}`);
  const o = out as Record<string, unknown>;
  assert.deepEqual(o.paths, ['src/a.ts', 'src/relative.ts']);
  assert.equal(o.Path, 'tool/bin');
  assert.equal(o.ROOT, 'repo/x');
  assert.equal(
    o.message,
    "ENOENT: no such file, open 'app/x.md' (cwd repo/.teamtrail)".replace(
      'repo/.teamtrail',
      `${path.basename(top)}/repo`,
    ),
  );
  assert.equal(o.win, 'failed at app/x.md, retry');
  assert.equal(o.note, 'see /scout and docs/guide.md');
  assert.ok('repo/keyed.ts' in o);
});

/**
 * A subscriber to /events as `headers`: `open` once the server has said its first line (the stream is
 * registered), `event` with the data of the first `agent` event it then sees.
 */
function subscribe(headers: Record<string, string>) {
  let opened!: () => void;
  const open = new Promise<void>((r) => (opened = r));
  const event = new Promise<string>((resolve, reject) => {
    const deadline = setTimeout(() => {
      req.destroy();
      reject(new Error(`no agent event within 10 s for ${JSON.stringify(headers)}`));
    }, 10_000);
    const req = http.get({ host: '127.0.0.1', port, path: '/events', headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => {
        text += c;
        opened();
        const m = /event: agent\ndata: (.*)\n\n/.exec(text);
        if (!m) return;
        clearTimeout(deadline);
        req.destroy();
        resolve(m[1]);
      });
    });
    req.on('error', (e) => (req.destroyed ? undefined : reject(e)));
  });
  return { open, event };
}

test('the /events stream is redacted for other devices and left whole for this machine', async () => {
  const worktree = path.join(top, 'repo.teamtrail', 'trail-3');
  // Both streams are open before the session is written: on Linux the folder watch sends it at once.
  const subscribers = [subscribe(LAN), subscribe({})];
  await Promise.all(subscribers.map((sub) => sub.open));
  const both = Promise.all(subscribers.map((sub) => sub.event));
  const dir = path.join(root, '.agents', 'sessions');
  mkdirSync(dir, { recursive: true });
  const doc = {
    v: 1,
    pid: process.pid,
    updatedAt: Date.now(),
    session: { id: 's1', status: 'running', cwd: worktree, note: `in ${worktree}` },
  };
  writeFileSync(path.join(dir, 's1.json'), JSON.stringify(doc));
  const [lan, local] = await both;
  assert.ok(!lan.includes(top), lan);
  assert.equal(JSON.parse(lan).session.cwd, 'repo.teamtrail/trail-3');
  assert.equal(JSON.parse(lan).session.note, 'in repo.teamtrail/trail-3');
  assert.equal(JSON.parse(local).session.cwd, worktree);
});
