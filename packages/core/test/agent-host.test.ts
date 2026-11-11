import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ActivityStream, agentPaths, type AgentSessionDoc } from '../src';
import {
  AgentDocWriter,
  readAgentDocs,
  readLookoutLock,
  writeAgentAnswer,
  writeLookoutLock,
  writeJsonAtomic,
} from '../src/agentHost';
import { createTrackerBridge } from '../src/bridge';

let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'teamtrail-agents-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const until = async (fn: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};

describe('agent link files', () => {
  it('writes session docs and delivers answers back to a waiting ask', async () => {
    const activity = new ActivityStream();
    const writer = new AgentDocWriter(root, activity, { pollMs: 20, client: () => 'test-client 1.0' });
    const s = activity.startSession({ id: 's_t1', agent: 'claude-01', mode: 'work', mapId: 'm1' });
    const answer = s.ask('Ship on Friday?', ['Yes', 'No']);
    writer.flush();
    const [d] = await readAgentDocs(root);
    expect(d.session.id).toBe('s_t1');
    expect(d.client).toBe('test-client 1.0');
    expect(d.pending[0]).toMatchObject({ text: 'Ship on Friday?', suggestions: ['Yes', 'No'] });
    writeAgentAnswer(root, {
      sessionId: 's_t1',
      questionId: d.pending[0].id,
      text: ' Yes ',
      author: 'trail lead',
      via: 'lookout',
    });
    await expect(answer).resolves.toBe('Yes');
    writer.flush();
    const [after] = await readAgentDocs(root);
    expect(after.pending).toHaveLength(0);
    expect(after.answered).toHaveLength(1);
    expect(fs.existsSync(path.join(root, agentPaths.answer('s_t1', d.pending[0].id)))).toBe(false);
    writer.close();
  });

  it('rejects answers to questions that are not open', () => {
    const activity = new ActivityStream();
    const writer = new AgentDocWriter(root, activity);
    activity.startSession({ id: 's_t2', agent: 'claude-01', mode: 'work', mapId: 'm1' });
    writer.flush();
    expect(() =>
      writeAgentAnswer(root, {
        sessionId: 's_t2',
        questionId: 'q_nope',
        text: 'x',
        author: 'trail lead',
        via: 'lookout',
      }),
    ).toThrow(/not waiting/);
    expect(() =>
      writeAgentAnswer(root, {
        sessionId: 's_missing',
        questionId: 'q',
        text: 'x',
        author: 'trail lead',
        via: 'lookout',
      }),
    ).toThrow(/unknown session/);
    writer.close();
  });

  it('shows sessions of dead processes as disconnected with nothing pending', async () => {
    const dead: AgentSessionDoc = {
      v: 1,
      session: {
        id: 's_dead',
        agent: 'claude-02',
        mode: 'work',
        mapId: 'm1',
        step: 1,
        total: 5,
        stepLabel: 'Load trail',
        status: 'running',
        waitingOn: 'q1',
        startedAt: Date.now(),
      },
      chats: [],
      pending: [{ id: 'q1', sessionId: 's_dead', mapId: 'm1', agent: 'claude-02', text: '?', at: Date.now() }],
      answered: [],
      feed: [],
      pid: 2 ** 22 + 12345,
      updatedAt: Date.now(),
    };
    writeJsonAtomic(path.join(root, agentPaths.session('s_dead')), dead);
    const [d] = await readAgentDocs(root);
    expect(d.session.status).toBe('failed');
    expect(d.pending).toHaveLength(0);
    expect(d.feed.at(-1)?.text).toBe('Agent disconnected');
  });

  it('tracks the running Lookout with a lock file', () => {
    const unlock = writeLookoutLock(root, 'http://localhost:7420/');
    expect(readLookoutLock(root)?.url).toBe('http://localhost:7420/');
    unlock();
    expect(readLookoutLock(root)).toBeUndefined();
  });
});

describe('bridge /agents API', () => {
  it('lists sessions, streams agent events and accepts answers', async () => {
    const bridge = createTrackerBridge(root);
    const server = http.createServer((req, res) => void bridge.handle(req, res));
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    try {
      const events: string[] = [];
      const sse = http.get(`${base}/events`, (res) => res.on('data', (c: Buffer) => events.push(c.toString())));
      await new Promise((r) => setTimeout(r, 150));

      const activity = new ActivityStream();
      const writer = new AgentDocWriter(root, activity, { pollMs: 20 });
      const s = activity.startSession({ id: 's_b1', agent: 'codex-01', mode: 'work', mapId: 'm1' });
      const answer = s.ask('Feature flag it?');
      writer.flush();

      await until(() => events.join('').includes('event: agent'));
      expect(events.join('')).not.toContain('"path":".agents');
      const listed = (await (await fetch(`${base}/agents`)).json()) as { sessions: AgentSessionDoc[] };
      expect(listed.sessions.map((d) => d.session.id)).toEqual(['s_b1']);
      const qid = listed.sessions[0].pending[0].id;

      const bad = await fetch(`${base}/agents/answer`, {
        method: 'POST',
        body: JSON.stringify({ sessionId: 's_b1', questionId: 'nope', text: 'x' }),
      });
      expect(bad.status).toBe(409);
      const ok = await fetch(`${base}/agents/answer`, {
        method: 'POST',
        body: JSON.stringify({ sessionId: 's_b1', questionId: qid, text: 'Yes, behind a flag' }),
      });
      expect(ok.status).toBe(201);
      await expect(answer).resolves.toBe('Yes, behind a flag');
      expect(activity.snapshot.chats.at(-1)).toMatchObject({ from: 'human', author: 'trail lead', via: 'lookout' });

      // Each report replaces the doc by rename; every state must reach the stream, including the last.
      s.step(2, 'claim');
      writer.flush();
      s.done(true, 'closed');
      writer.flush();
      const docsIn = () =>
        events
          .join('')
          .split('\n\n')
          .filter((e) => e.startsWith('event: agent'))
          .map((e) => JSON.parse(e.slice(e.indexOf('data: ') + 6)) as AgentSessionDoc);
      await until(() => docsIn().at(-1)?.session.status === 'done');
      writer.close();
      sse.destroy();
    } finally {
      bridge.close();
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    }
  });
});
