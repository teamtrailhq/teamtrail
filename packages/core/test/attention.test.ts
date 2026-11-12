import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ATTENTION_POLICY,
  DEFAULT_MAP_MODE,
  buildAttention,
  heldTickets,
  isDismissable,
  isFocused,
  isInterrupting,
  parseAttentionPolicy,
  parseAttentionPrefs,
  type AttentionInput,
  type AttentionItem,
  type KnowledgeEntry,
  type MapSnapshot,
  type PendingQuestion,
  type SessionInfo,
  type Ticket,
} from '../src';

const now = Date.UTC(2026, 10, 4, 12);
const min = 60_000;

function ticket(id: string, patch: Partial<Ticket> = {}): Ticket {
  return {
    id,
    key: `#${id}`,
    title: `Ticket ${id}`,
    type: 'task',
    body: '',
    state: 'open',
    blockedBy: [],
    comments: [],
    createdAt: now - 60 * min,
    updatedAt: now - 60 * min,
    ...patch,
  };
}

function snap(tickets: Ticket[], id = 'm1'): MapSnapshot {
  return {
    map: {
      id,
      key: '#1',
      title: 'Reminders',
      mode: DEFAULT_MAP_MODE,
      sections: {} as MapSnapshot['map']['sections'],
      createdAt: now,
      updatedAt: now,
    },
    tickets,
  };
}

function question(id: string, patch: Partial<PendingQuestion> = {}): PendingQuestion {
  return { id, sessionId: `s-${id}`, mapId: 'm1', agent: 'claude-01', text: `Question ${id}?`, at: now, ...patch };
}

function session(id: string, patch: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    agent: 'claude-01',
    mode: 'work',
    mapId: 'm1',
    step: 2,
    total: 5,
    stepLabel: 'work',
    status: 'running',
    startedAt: now - 30 * min,
    ...patch,
  } as SessionInfo;
}

const knowledge = (id: string, patch: Partial<KnowledgeEntry> = {}): KnowledgeEntry => ({
  id,
  title: `Entry ${id}`,
  body: '',
  kind: 'fact',
  status: 'confirmed',
  scope: [],
  tags: [],
  sources: [],
  anchors: [],
  createdBy: 'codex-02',
  createdAt: now - 10 * min,
  updatedAt: now - 10 * min,
  ...patch,
});

function input(patch: Partial<AttentionInput> = {}): AttentionInput {
  return {
    snaps: [],
    questions: [],
    sessions: [],
    approvals: [],
    syncs: [],
    leases: [],
    knowledge: [],
    briefs: [],
    now,
    ...patch,
  };
}

const ids = (items: AttentionItem[]) => items.map((i) => i.id);

// A diamond: 1 blocks 2 and 3, both block 4; 5 hangs off 4.
const diamond = snap([
  ticket('1'),
  ticket('2', { blockedBy: ['1'] }),
  ticket('3', { blockedBy: ['1'] }),
  ticket('4', { blockedBy: ['2', '3'] }),
  ticket('5', { blockedBy: ['4'] }),
  ticket('6', { blockedBy: ['4'], state: 'closed', closeReason: 'completed' }),
]);

describe('attention queue', () => {
  it('counts what an item holds up transitively, each ticket once', () => {
    expect(heldTickets(diamond, ['1'], '1')).toEqual(['2', '3', '4', '5']);
    expect(heldTickets(diamond, ['2'])).toEqual(['2', '4', '5']);
    expect(heldTickets(undefined, ['1'])).toEqual([]);
  });

  it('every source produces items with reasons', () => {
    const gated = snap([ticket('1', { type: 'research' }), ticket('2', { type: 'execute' })], 'm2');
    const hitl = snap(
      [ticket('7', { type: 'junction' }), ticket('8', { type: 'task', hitl: true, assignee: 'x' })],
      'm3',
    );
    const q = buildAttention(
      input({
        snaps: [diamond, gated, hitl],
        questions: [question('q1', { ticketId: '1' })],
        approvals: [
          {
            kind: 'approve',
            mapId: 'm1',
            ticketId: '2',
            ticketKey: '#2',
            title: 'Two',
            reason: 'review passed',
            at: now,
          },
          { kind: 'held', mapId: 'm1', ticketId: '3', ticketKey: '#3', title: 'Three', reason: 'A-2 failed', at: now },
        ],
        syncs: [
          {
            mapId: 'm1',
            ticketId: '4',
            ticketKey: '#4',
            flags: [{ kind: 'pr-closed-unmerged', severity: 'alert', text: 'PR closed unmerged', since: now }],
          },
        ] as AttentionInput['syncs'],
        leases: [
          {
            v: 1,
            mapId: 'm1',
            ticketId: '5',
            ticketKey: '#5',
            agent: 'codex-01',
            pid: 1,
            claimedAt: now - 30 * min,
            renewedAt: now - 20 * min,
            ttlMs: 15 * min,
            expiresAt: now - 5 * min,
            notes: [],
            decisions: [],
          },
        ],
        knowledge: [
          knowledge('K-1', { status: 'suggested' }),
          knowledge('K-2', { flag: { by: 'codex-02', reason: 'moved to accounts', at: now } }),
          knowledge('K-3'),
        ],
        briefs: [
          {
            mapId: 'm2',
            status: 'submitted',
            ticketId: '1',
            author: 'claude-02',
            submittedAt: now,
            sections: {},
          } as never,
        ],
      }),
    );
    const kinds = new Set(q.items.map((i) => i.kind));
    expect([...kinds].sort()).toEqual(
      ['approval', 'blocked', 'brief', 'flag', 'hitl-ready', 'knowledge', 'question', 'stalled'].sort(),
    );
    expect(q.items.filter((i) => i.kind === 'knowledge').map((i) => i.ref)).toEqual(['K-2', 'K-1']);
    expect(q.items.find((i) => i.kind === 'hitl-ready')?.ticketId).toBe('7');
    expect(q.items.find((i) => i.kind === 'question')?.reasons).toContain('blocks 4 tickets');
    expect(q.items.find((i) => i.kind === 'brief')?.reasons).toEqual([
      'implementation waits for your review',
      'blocks 1 ticket',
    ]);
    for (const i of q.items) expect(i.reasons.length + i.score).toBeGreaterThan(0);
  });

  it('ranks idle, blocking and holding questions first, with plain reasons', () => {
    const q = buildAttention(
      input({
        snaps: [diamond],
        questions: [
          question('fyi', { urgency: 'fyi', at: now - 5 * min, agent: 'codex-01', sessionId: 's-b' }),
          question('block', { urgency: 'blocking', ticketId: '1', at: now - 12 * min }),
        ],
        sessions: [session('s-block', { waitingOn: 'block' }), session('s-b', { agent: 'codex-01', waitingOn: 'fyi' })],
      }),
    );
    expect(ids(q.items)).toEqual(['question:m1:block', 'question:m1:fyi']);
    expect(q.items[0].reasons).toEqual([
      'marked blocking',
      'blocks 4 tickets',
      'claude-01 idle for 12 min',
      'answer together with 1 more',
    ]);
    expect(q.items[0].urgency).toBe('blocking');
    expect(q.items[1].reasons).toContain('fyi, when convenient');
    expect(q.items[1].reasons.some((r) => r.includes('idle') || r.includes('waiting for you'))).toBe(false);
  });

  it('old clients without urgency count as soon, and their waiting agent as idle', () => {
    const q = buildAttention(
      input({ questions: [question('old')], sessions: [session('s-old', { waitingOn: 'old' })] }),
    );
    expect(q.items[0]).toMatchObject({ urgency: 'soon', kind: 'question' });
    expect(q.items[0].reasons[0]).toMatch(/^claude-01 (idle|is waiting)/);
  });

  it('fewer questions rank better, and a batch stays together', () => {
    const many = ['a', 'b', 'c'].map((id) => question(id, { agent: 'codex-01', sessionId: 's-x' }));
    const one = question('one', { mapId: 'm2', agent: 'claude-01' });
    const q = buildAttention(input({ questions: [...many, one] }));
    expect(q.items[0].id).toBe('question:m2:one');
    expect(q.items.slice(1).every((i) => i.batchKey === 'm1:decide')).toBe(true);
    expect(q.items[1].reasons).toContain('3 questions from codex-01');
    expect(q.items[1].score).toBeLessThan(q.items[0].score);
  });

  it('the question an agent waits on keeps its full score, beside its other open questions', () => {
    // Live test: a high-risk question asked without waiting, then an ordinary blocking one the agent waits on.
    // The second scored 30 + 25 + 15 = 70, minus 2 for "2 questions" = 68, under the interrupt: it never reached Slack.
    const qs = [
      question('risky', { sessionId: 's-1', urgency: 'blocking', category: 'data-deletion' }),
      question('plain', { sessionId: 's-1', urgency: 'blocking' }),
    ];
    const q = buildAttention(input({ questions: qs, sessions: [session('s-1', { waitingOn: 'plain' })] }));
    const plain = q.items.find((i) => i.ref === 'plain')!;
    const risky = q.items.find((i) => i.ref === 'risky')!;
    expect(plain.score).toBe(70);
    expect(isInterrupting(plain, DEFAULT_ATTENTION_POLICY, { v: 1, channel: 'slack-channel' }, now)).toBe(true);
    expect(plain.reasons).not.toContain('2 questions from claude-01');
    expect(risky.reasons).toContain('2 questions from claude-01');
  });

  it('orders equal scores the same way every time', () => {
    const qs = ['q3', 'q1', 'q2'].map((id) => question(id, { mapId: id, sessionId: id }));
    const a = buildAttention(input({ questions: qs }));
    const b = buildAttention(input({ questions: [...qs].reverse() }));
    expect(ids(a.items)).toEqual(['question:q1:q1', 'question:q2:q2', 'question:q3:q3']);
    expect(ids(b.items)).toEqual(ids(a.items));
  });

  it('hides snoozed items until the snooze runs out, and dismissed fyi items', () => {
    const qs = [question('a'), question('b', { urgency: 'fyi', mapId: 'm2' })];
    const state = { v: 1 as const, snoozed: { 'question:m1:a': now + 10 * min }, dismissed: ['question:m2:b'] };
    const hidden = buildAttention(input({ questions: qs, state }));
    expect(hidden.items).toEqual([]);
    expect(hidden.hidden).toBe(2);
    const later = buildAttention(input({ questions: qs, state, now: now + 11 * min }));
    expect(ids(later.items)).toEqual(['question:m1:a']);
  });

  it('flags high-risk changes made without asking, until the human sets the flag aside', () => {
    const violation = {
      mapId: 'm1',
      ticketId: '4',
      ticketKey: '#4',
      agent: 'codex-02',
      attemptId: 'A-1',
      at: now - 5 * min,
      paths: ['db/migrations/001.sql'],
      globs: ['**/migrations/**'],
      reason: 'codex-02 changed db/migrations/001.sql matching **/migrations/** without asking you',
    };
    const base = input({ snaps: [snap([ticket('4')])], violations: [violation] });
    const [item] = buildAttention(base).items;
    expect(item).toMatchObject({ id: 'policy:m1:4', kind: 'policy', ticketId: '4', agent: 'codex-02' });
    expect(item.title).toBe('Check #4: high-risk files changed without asking');
    expect(item.reasons[0]).toBe(violation.reason);
    expect(isDismissable(item)).toBe(true);
    const state = { v: 1 as const, snoozed: {}, dismissed: ['policy:m1:4'] };
    expect(buildAttention({ ...base, state }).items).toEqual([]);
  });
});

describe('attention policy and prefs', () => {
  it('reports every problem in attention.json and keeps the defaults for bad values', () => {
    const r = parseAttentionPolicy({ v: 2, weights: { question: 120, gossip: 5, flag: 10 }, interrupt: 'x', extra: 1 });
    expect(r.errors).toEqual([
      'unknown key "extra"',
      '"v" must be 1',
      'weights.question must be a number from 0 to 100',
      expect.stringMatching(/^unknown kind "gossip" in "weights"/),
      '"interrupt" must be a number from 0 to 200',
    ]);
    expect(r.value.weights.question).toBe(DEFAULT_ATTENTION_POLICY.weights.question);
    expect(r.value.weights.flag).toBe(10);
    expect(parseAttentionPolicy({ v: 1, interrupt: 50 })).toEqual({
      value: { ...DEFAULT_ATTENTION_POLICY, interrupt: 50 },
      errors: [],
    });
  });

  it('validates prefs', () => {
    expect(parseAttentionPrefs({ v: 1, channel: 'pager', focus: { from: '9', to: '17:00' } }).errors).toEqual([
      '"channel" must be one of browser, slack-dm, slack-channel, none',
      '"focus.from" and "focus.to" must be HH:MM',
    ]);
    expect(parseAttentionPrefs({ v: 1, focus: { from: '22:00', to: '07:00', days: [1] } }).value.focus).toEqual({
      from: '22:00',
      to: '07:00',
      days: [1],
    });
  });

  it('focus hours hold interruptions back, never the queue', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m).getTime(); // a Monday, local time
    const prefs = { v: 1 as const, channel: 'browser' as const, focus: { from: '09:00', to: '12:00' } };
    const item = { score: 90 } as AttentionItem;
    expect(isInterrupting(item, DEFAULT_ATTENTION_POLICY, prefs, at(10))).toBe(false);
    expect(isInterrupting(item, DEFAULT_ATTENTION_POLICY, prefs, at(12, 1))).toBe(true);
    expect(isInterrupting({ score: 60 } as AttentionItem, DEFAULT_ATTENTION_POLICY, prefs, at(13))).toBe(false);
    expect(isFocused({ ...prefs, focusUntil: at(14) }, at(13))).toBe(true);
    const overnight = { ...prefs, focus: { from: '22:00', to: '07:00', days: [1] } };
    expect(isFocused(overnight, at(23))).toBe(true); // Monday night
    expect(isFocused(overnight, new Date(2026, 10, 3, 6).getTime())).toBe(true); // Tuesday 06:00, Monday's window
    expect(isFocused(overnight, new Date(2026, 10, 2, 6).getTime())).toBe(false); // Monday 06:00, Sunday's window
    const q = buildAttention(input({ questions: [question('a', { urgency: 'blocking' })] }));
    expect(q.items).toHaveLength(1);
  });
});
