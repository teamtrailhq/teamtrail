import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createTrackerBridge } from '../src/bridge';
import type { AttentionView } from '../src/model/attention';

/*
 * The server sends the `attention` event only when the queue changed since its last one. A page also loads the
 * queue itself (GET /attention) when it hears of a change, so it can hold a queue the server never sent: when the
 * queue then changes back before the next tick (a ticket added, then claimed), the tick finds nothing new to send,
 * and the page kept showing the ticket as waiting for good.
 */

function questionDoc() {
  const now = Date.now();
  const session = { id: 's1', agent: 'claude-01', mode: 'work', mapId: '', step: 1, total: 3, stepLabel: 'framing' };
  return {
    v: 1,
    session: { ...session, status: 'running', waitingOn: 'q1', startedAt: now },
    chats: [],
    pending: [{ id: 'q1', sessionId: 's1', mapId: '', agent: 'claude-01', text: 'SMS or push?', at: now }],
    answered: [],
    feed: [],
    pid: process.pid,
    updatedAt: now,
  };
}

/** The `attention` events of one `/events` stream, as they arrive. */
async function attentionEvents(base: string, signal: AbortSignal) {
  const events: AttentionView[] = [];
  const res = await fetch(`${base}/events`, { signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  void (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
      if (done) return;
      text += decoder.decode(value);
      const parts = text.split('\n\n');
      text = parts.pop()!;
      for (const p of parts) {
        const m = p.match(/^event: attention\ndata: (.*)$/s);
        if (m) events.push(JSON.parse(m[1]) as AttentionView);
      }
    }
  })();
  return events;
}

async function until(ok: () => boolean, ms: number) {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((done) => setTimeout(done, 20));
  return ok();
}

test('a queue a page loaded between two ticks is corrected by the next tick, even when it changed back', async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'teamtrail-attention-push-'));
  const root = path.join(tmp, '.teamtrail');
  const sessions = path.join(root, '.agents', 'sessions');
  mkdirSync(sessions, { recursive: true });
  const bridge = createTrackerBridge(root, {
    env: {},
    configDir: path.join(tmp, 'config'),
    cwd: tmp,
    attention: { pollMs: 800 },
  });
  const server = http.createServer((req, res) => void bridge.handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const ctl = new AbortController();
  try {
    const events = await attentionEvents(base, ctl.signal);
    assert.ok(await until(() => events.length === 1, 5000), 'the first tick sends the queue');
    assert.deepEqual(events[0].items, []);
    // right after that tick: a question arrives, the page loads the queue with it, and it is answered at once
    writeFileSync(path.join(sessions, 's1.json'), JSON.stringify(questionDoc()));
    const loaded = (await (await fetch(`${base}/attention`)).json()) as AttentionView;
    rmSync(path.join(sessions, 's1.json'));
    assert.deepEqual(
      loaded.items.map((i) => i.id),
      ['question::q1'],
    );
    assert.ok(await until(() => events.length > 1, 4000), 'the next tick sends the queue the page no longer has');
    assert.deepEqual(events.at(-1)!.items, []);
  } finally {
    ctl.abort();
    bridge.close();
    server.close();
  }
});
