import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { MarkdownAdapter } from '../src/adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../src/adapters/markdown/nodeMarkdownFs';
import { NUMBERS_FILE } from '../src/adapters/markdown/numberRecord';
import { createTrackerBridge } from '../src/bridge';
import { chartMap } from '../src/planning/operations/chart';

/*
 * A trail's `#n` and its tickets' come from one count: handed out once, even when several processes create trails
 * and tickets at once, and never again after a trail is removed.
 */

const SECTIONS = { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] };

const adapterOf = (root: string, by = 'agent claude-01') =>
  new MarkdownAdapter({ ...nodeMarkdownFs(root, { by }), watch: undefined }, root);

/** A process of its own creating trails, each with two tickets, at the same time as others. */
if (process.env.TRAIL_KEY_WORKER) {
  const [root, who] = process.env.TRAIL_KEY_WORKER.split('|');
  const adapter = adapterOf(root, who);
  for (let i = 0; i < 3; i++) {
    const map = await adapter.createMap({ title: `${who} ${i}`, sections: SECTIONS });
    await Promise.all(
      ['a', 'b'].map((t) => adapter.createTicket(map.id, { title: `${who} ${i}${t}`, type: 'task', body: '' })),
    );
  }
  process.exit(0);
}

const tmpRoot = () => {
  const root = path.join(mkdtempSync(path.join(os.tmpdir(), 'teamtrail-keys-')), '.teamtrail');
  mkdirSync(root, { recursive: true });
  return root;
};

const chart = (root: string, title: string) =>
  chartMap(adapterOf(root), {
    title,
    sections: { ...SECTIONS, destination: title },
    tickets: [{ ref: 'a', title: `${title} work`, type: 'task', body: 'Do it.' }],
  });

const keysOf = async (root: string) => {
  const adapter = adapterOf(root);
  const snaps = await Promise.all((await adapter.listMaps()).map((m) => adapter.loadMap(m.id)));
  return snaps.flatMap((s) => [s.map.key, ...s.tickets.map((t) => t.key)]);
};

test('trails and tickets created one after another keep counting as before', async () => {
  const root = tmpRoot();
  const first = await chart(root, 'First');
  const second = await chart(root, 'Second');
  assert.deepEqual(
    [first.map.key, ...first.tickets.map((t) => t.key), second.map.key, ...second.tickets.map((t) => t.key)],
    ['#1', '#2', '#3', '#4'],
  );
});

test('a removed trail’s numbers are never given again', async () => {
  const root = tmpRoot();
  const gone = await chart(root, 'Gone');
  rmSync(path.join(root, gone.map.id), { recursive: true });
  const next = await chart(root, 'Next');
  assert.equal(next.map.key, '#3', 'not #1, the removed trail’s');
  assert.equal(next.tickets[0].key, '#4');
});

test('a project from before the count keeps its numbers and counts on from the highest', async () => {
  const root = tmpRoot();
  await chart(root, 'Old');
  rmSync(path.join(root, NUMBERS_FILE));
  assert.equal((await chart(root, 'New')).map.key, '#3');
  assert.deepEqual(JSON.parse(readFileSync(path.join(root, NUMBERS_FILE), 'utf8')), { highest: 4 });
});

test('processes creating trails and tickets at once never share a number', async () => {
  const root = tmpRoot();
  const self = fileURLToPath(import.meta.url);
  const run = (who: string) =>
    new Promise<number>((resolve) => {
      const child = spawn(process.execPath, [self], {
        env: { ...process.env, TRAIL_KEY_WORKER: `${root}|${who}` },
        stdio: 'inherit',
      });
      child.on('exit', (code) => resolve(code ?? 1));
    });
  assert.deepEqual(await Promise.all(['a', 'b', 'c', 'd'].map(run)), [0, 0, 0, 0]);
  const keys = await keysOf(root);
  assert.equal(keys.length, 4 * 3 * 3, 'every trail and ticket was created');
  assert.equal(new Set(keys).size, keys.length, `no number twice: ${keys.join(' ')}`);
});

test('the Lookout’s page gets its numbers from the same count, on this machine only', async () => {
  const root = tmpRoot();
  await chart(root, 'First');
  const peer = (req: http.IncomingMessage) => (req.headers['x-test-peer'] as string | undefined) ?? '127.0.0.1';
  const bridge = createTrackerBridge(root, { env: {}, configDir: path.join(root, '..', 'config'), cwd: root, peer });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  const ask = (body: unknown, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}/file/number`, { method: 'POST', headers, body: JSON.stringify(body) });
  try {
    assert.deepEqual(await (await ask({ atLeast: 1 })).json(), { n: 3 });
    assert.deepEqual(await (await ask({ atLeast: 1 })).json(), { n: 4 }, 'never the same one twice');
    assert.deepEqual(await (await ask({ atLeast: 10 })).json(), { n: 10 });
    assert.equal((await ask({ atLeast: 'x' })).status, 400);
    assert.equal((await ask({ atLeast: 1 }, { 'x-test-peer': '192.168.1.20' })).status, 403, 'not another device');
    assert.equal((await chart(root, 'Next')).map.key, '#11');
  } finally {
    bridge.close();
    server.closeAllConnections();
    server.close();
  }
});
