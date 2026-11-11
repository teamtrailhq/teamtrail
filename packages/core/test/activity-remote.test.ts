import { describe, expect, it } from 'vitest';
import { ActivityStream, UsageLedger, memoryStore, type AgentSessionDoc, type PendingQuestion } from '../src';

function doc(patch: Partial<AgentSessionDoc> & { usage?: AgentSessionDoc['session']['usage'] } = {}): AgentSessionDoc {
  const { usage, ...rest } = patch;
  return {
    v: 1,
    session: {
      id: 's_remote',
      agent: 'claude-01',
      mode: 'work',
      mapId: 'm1',
      ticketId: '3',
      step: 2,
      total: 5,
      stepLabel: 'Claim',
      status: 'running',
      startedAt: 1000,
      usage,
    },
    chats: [],
    pending: [],
    answered: [],
    feed: [
      {
        id: 'f1',
        at: 1000,
        source: 'session',
        sessionId: 's_remote',
        agent: 'claude-01',
        level: 'info',
        text: 'Session opened · work',
      },
    ],
    pid: 1,
    updatedAt: 2000,
    ...rest,
  };
}

describe('ActivityStream.syncRemote', () => {
  it('mirrors a remote session and replaces its slice on each report', () => {
    const a = new ActivityStream();
    a.syncRemote(doc());
    expect(a.snapshot.sessions).toHaveLength(1);
    expect(a.isRemote('s_remote')).toBe(true);
    const q: PendingQuestion = {
      id: 'q1',
      sessionId: 's_remote',
      mapId: 'm1',
      ticketId: '3',
      agent: 'claude-01',
      text: 'Which DB?',
      at: 1500,
    };
    a.syncRemote(
      doc({
        pending: [q],
        chats: [
          {
            id: 'c1',
            sessionId: 's_remote',
            from: 'agent',
            author: 'claude-01',
            text: 'Which DB?',
            at: 1500,
            questionId: 'q1',
          },
        ],
      }),
    );
    expect(a.snapshot.pending.map((p) => p.id)).toEqual(['q1']);
    expect(a.snapshot.chats).toHaveLength(1);
    a.syncRemote(doc({ pending: [] }));
    expect(a.snapshot.pending).toHaveLength(0);
    expect(a.snapshot.sessions).toHaveLength(1);
  });

  it('adds only usage growth to the trail total and the ledger', () => {
    const ledger = new UsageLedger(memoryStore());
    const a = new ActivityStream(400, ledger);
    a.syncRemote(doc({ usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.01 } }));
    a.syncRemote(doc({ usage: { inputTokens: 100, outputTokens: 10, costUsd: 0.01 } }));
    a.syncRemote(doc({ usage: { inputTokens: 250, outputTokens: 30, costUsd: 0.03 } }));
    expect(a.snapshot.usageByMap.m1).toEqual({ inputTokens: 250, outputTokens: 30, costUsd: 0.03 });
    expect(ledger.since('m1', 0)).toMatchObject({ inputTokens: 250, outputTokens: 30, sessions: 1 });
  });

  it('counts a chart session mirrored before its trail existed once it is bound', () => {
    const a = new ActivityStream();
    const chart = (mapId: string, inputTokens: number) => {
      const d = doc({ usage: { inputTokens, outputTokens: 0, costUsd: 0 } });
      return { ...d, session: { ...d.session, mode: 'chart' as const, mapId, ticketId: undefined } };
    };
    a.syncRemote(chart('', 2000));
    a.syncRemote(chart('m1', 4000));
    expect(a.snapshot.usageByMap.m1).toMatchObject({ inputTokens: 4000 });
  });

  it('setUsage replaces a session total (measured from logs) and moves the trail total by the difference', () => {
    const ledger = new UsageLedger(memoryStore());
    const a = new ActivityStream(400, ledger);
    const s = a.startSession({ agent: 'claude-01', mode: 'work', mapId: 'm1' });
    s.usage({ inputTokens: 999, outputTokens: 1, costUsd: 9, source: 'reported' });
    s.setUsage({
      inputTokens: 300,
      outputTokens: 20,
      costUsd: 0.05,
      cachedInputTokens: 250,
      source: 'claude-code',
      models: ['claude-sonnet-4-5'],
    });
    s.setUsage({
      inputTokens: 500,
      outputTokens: 40,
      costUsd: 0.08,
      cachedInputTokens: 400,
      source: 'claude-code',
      models: ['claude-sonnet-4-5'],
    });
    expect(s.info.usage).toEqual({
      inputTokens: 500,
      outputTokens: 40,
      costUsd: 0.08,
      cachedInputTokens: 400,
      source: 'claude-code',
      models: ['claude-sonnet-4-5'],
    });
    expect(a.snapshot.usageByMap.m1).toMatchObject({ inputTokens: 500, outputTokens: 40, cachedInputTokens: 400 });
    expect(a.snapshot.usageByMap.m1.costUsd).toBeCloseTo(0.08, 9);
    const mirror = new ActivityStream();
    mirror.syncRemote(doc({ usage: s.info.usage }));
    expect(mirror.snapshot.sessions[0].usage?.source).toBe('claude-code');
    expect(mirror.snapshot.usageByMap.m1).toMatchObject({ inputTokens: 500, cachedInputTokens: 400 });
  });

  it('does not double count usage in a persisted ledger after a reload', async () => {
    const store = memoryStore();
    const first = new UsageLedger(store);
    first.addTotal('m1', 's_remote', { inputTokens: 100, outputTokens: 0, costUsd: 0 });
    await new Promise((r) => setTimeout(r, 2100));
    const reloaded = new UsageLedger(store);
    reloaded.addTotal('m1', 's_remote', { inputTokens: 140, outputTokens: 0, costUsd: 0 });
    expect(reloaded.since('m1', 0).inputTokens).toBe(140);
  });

  it('routes operator answers for remote questions through remoteAnswer', () => {
    const a = new ActivityStream();
    const sent: [string, string, string][] = [];
    a.remoteAnswer = (q, text, author) => sent.push([q.id, text, author]);
    const q: PendingQuestion = {
      id: 'q1',
      sessionId: 's_remote',
      mapId: 'm1',
      agent: 'claude-01',
      text: 'Which DB?',
      at: 1500,
    };
    a.syncRemote(doc({ pending: [q] }));
    expect(a.answer('q1', 'Postgres', 'trail lead', { via: 'lookout' })).toBe(true);
    expect(sent).toEqual([['q1', 'Postgres', 'trail lead']]);
    expect(a.snapshot.pending).toHaveLength(0);
    expect(a.snapshot.chats.at(-1)).toMatchObject({ from: 'human', text: 'Postgres' });
  });

  it('never lets a remote report overwrite a local session', () => {
    const a = new ActivityStream();
    const s = a.startSession({ agent: 'claude-07', mode: 'work', mapId: 'm1', id: 's_remote' });
    a.syncRemote(doc());
    expect(a.snapshot.sessions.find((x) => x.id === s.id)?.agent).toBe('claude-07');
    expect(a.isRemote(s.id)).toBe(false);
  });
});
