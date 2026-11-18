import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createTrackerBridge, type TrackerBridge } from '../src/bridge';
import type { AttentionView } from '../src/model/attention';

let server: http.Server;
let bridge: TrackerBridge;
let base: string;
let root: string;
let configDir: string;

before(async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-attention-'));
  root = path.join(tmp, '.teamtrail');
  configDir = path.join(tmp, 'config');
  mkdirSync(path.join(root, '.agents', 'sessions'), { recursive: true });
  const now = Date.now();
  const session = {
    id: 's1',
    agent: 'claude-01',
    mode: 'work',
    mapId: '',
    step: 1,
    total: 3,
    stepLabel: 'framing',
    status: 'running',
    waitingOn: 'q1',
    startedAt: now,
  };
  const doc = {
    v: 1,
    session,
    chats: [],
    pending: [
      { id: 'q1', sessionId: 's1', mapId: '', agent: 'claude-01', text: 'SMS or push?', at: now, urgency: 'blocking' },
    ],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: now,
  };
  writeFileSync(path.join(root, '.agents', 'sessions', 's1.json'), JSON.stringify(doc));
  bridge = createTrackerBridge(root, { env: {}, configDir, cwd: tmp });
  server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

after(() => {
  bridge.close();
  server.close();
});

const call = async <T>(method: string, p: string, body?: unknown) => {
  const r = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, json: (await r.json()) as T };
};

test('GET /attention ranks the open question, with reasons and the default policy', async () => {
  const r = await call<AttentionView>('GET', '/attention');
  assert.equal(r.status, 200);
  assert.deepEqual(
    r.json.items.map((i) => [i.id, i.urgency]),
    [['question::q1', 'blocking']],
  );
  assert.ok(r.json.items[0].reasons.includes('marked blocking'));
  assert.ok(
    r.json.items[0].reasons.some((x) => x.startsWith('claude-01 idle') || x === 'claude-01 is waiting for you'),
  );
  assert.deepEqual(r.json.interrupting, ['question::q1']);
  assert.equal(r.json.policy.exists, false);
  assert.deepEqual(r.json.policy.errors, []);
});

test('the attention SSE event carries the queue', async () => {
  const ctl = new AbortController();
  const res = await fetch(`${base}/events`, { signal: ctl.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const deadline = Date.now() + 8000;
  while (!text.includes('event: attention') && Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value);
  }
  ctl.abort();
  assert.match(text, /event: attention\ndata: .*"question::q1"/);
});

test('snooze hides an item and restore brings it back; the state file is gitignored', async () => {
  const s = await call('POST', '/attention/snooze', { id: 'question::q1', minutes: 30 });
  assert.equal(s.status, 200);
  const hidden = await call<AttentionView>('GET', '/attention');
  assert.deepEqual(hidden.json.items, []);
  assert.equal(hidden.json.hidden, 1);
  assert.equal(readFileSync(path.join(root, '.attention', '.gitignore'), 'utf8'), '*\n');
  await call('POST', '/attention/restore', { id: 'question::q1' });
  assert.equal((await call<AttentionView>('GET', '/attention')).json.items.length, 1);
  assert.equal((await call('POST', '/attention/snooze', { id: 'question::q1' })).status, 400);
});

test('prefs: bad input lists every error; focus mode holds interruptions back', async () => {
  const bad = await call<{ errors: string[] }>('PUT', '/attention/prefs', { v: 1, channel: 'pager', nope: 1 });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.json.errors, [
    'unknown key "nope"',
    '"channel" must be one of browser, slack-dm, slack-channel, none',
  ]);
  const ok = await call('PUT', '/attention/prefs', { v: 1, channel: 'slack-dm', focusUntil: Date.now() + 60_000 });
  assert.equal(ok.status, 200);
  const view = await call<AttentionView>('GET', '/attention');
  assert.equal(view.json.focused, true);
  assert.deepEqual(view.json.interrupting, []);
  assert.equal(view.json.items.length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(configDir, 'attention.json'), 'utf8')).channel, 'slack-dm');
});

test('mode: Hands-off by default; PUT /attention/mode keeps the other prefs and refuses an unknown mode', async () => {
  const before = await call<AttentionView>('GET', '/attention');
  assert.equal(before.json.prefs.mode, undefined);
  const on = await call<{ mode: string; channel: string }>('PUT', '/attention/mode', { mode: 'hands-on' });
  assert.equal(on.status, 200);
  assert.equal(on.json.mode, 'hands-on');
  assert.equal(on.json.channel, 'slack-dm');
  assert.equal(JSON.parse(readFileSync(path.join(configDir, 'attention.json'), 'utf8')).mode, 'hands-on');
  const bad = await call<{ errors: string[] }>('PUT', '/attention/mode', { mode: 'hands-free' });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.json.errors, ['"mode" must be one of hands-off, hands-on']);
  assert.equal((await call('PUT', '/attention/mode', { mode: 'hands-off' })).status, 200);
});

test('an invalid attention.json is reported, and the queue keeps the defaults', async () => {
  writeFileSync(path.join(root, 'attention.json'), JSON.stringify({ v: 1, interrupt: -1, weights: { gossip: 3 } }));
  const r = await call<AttentionView>('GET', '/attention');
  assert.equal(r.json.policy.exists, true);
  assert.equal(r.json.policy.errors.length, 2);
  assert.equal(r.json.policy.value.interrupt, 70);
  assert.equal(r.json.items.length, 1);
});
