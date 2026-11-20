import type { ActivityState, ChatMessage } from '@teamtrail/core';
import { describe, expect, test } from 'vitest';
import { agentMilestones, LANE_MILESTONES } from '../src/features/activity/agentMilestones';
import { laneSince } from '../src/features/activity/laneSince';
import { answeredLine } from '../src/features/inbox/answeredLine';

type Session = ActivityState['sessions'][number];
type Entry = ActivityState['feed'][number];

const session = (over: Partial<Session> = {}) =>
  ({
    id: 's1',
    agent: 'claude-05',
    mapId: 'm',
    ticketId: 't24',
    mode: 'work',
    step: 2,
    total: 5,
    stepLabel: 'Claim',
    status: 'running',
    startedAt: 1000,
    ...over,
  }) as Session;

let n = 0;
const entry = (e: Partial<Entry>): Entry =>
  ({ id: `e${++n}`, at: 2000, source: 'session', level: 'info', text: '', ...e }) as Entry;

describe('an agent’s milestones', () => {
  test('claimed, a question and its answer, a submission and how verification came back, in order', () => {
    const feed = [
      entry({ at: 1500, sessionId: 's1', level: 'step', tag: 'Work 3/5', text: 'Resolve: reading badge.tsx' }),
      entry({ at: 1600, sessionId: 's1', kind: 'asks-you', signal: true, level: 'alert', text: 'Decision request' }),
      entry({ at: 1700, sessionId: 's1', source: 'trail lead', kind: 'answered', level: 'ok', text: 'Answered' }),
      entry({ at: 1800, sessionId: 's1', level: 'step', text: '#24 submitted · checks: test' }),
      entry({ at: 1900, source: 'system', ticketId: 't24', kind: 'checks-failed', level: 'warn', text: 'rework' }),
      entry({ at: 2000, sessionId: 's1', level: 'step', text: '#24 submitted · checks: test' }),
      entry({ at: 2100, source: 'system', ticketId: 't24', kind: 'verified', level: 'ok', text: 'done' }),
    ];
    expect(agentMilestones({ session: session(), feed }).map((m) => m.kind)).toEqual([
      'asked',
      'answered',
      'submitted',
      'rework',
      'submitted',
      'verified',
    ]);
  });

  test('starts with the claim, and keeps only the latest few', () => {
    const feed = Array.from({ length: 10 }, (_, i) =>
      entry({ at: 2000 + i, sessionId: 's1', level: 'step', text: `#24 submitted · checks: t${i}` }),
    );
    const all = agentMilestones({ session: session(), feed });
    expect(all).toHaveLength(LANE_MILESTONES);
    expect(agentMilestones({ session: session(), feed: [] })).toEqual([{ kind: 'claimed', at: 1000 }]);
  });

  test('only the question the agent still waits on is open', () => {
    const feed = [
      entry({ at: 1100, sessionId: 's1', kind: 'asks-you', signal: true }),
      entry({ at: 1200, sessionId: 's1', kind: 'asks-you', signal: true }),
    ];
    const waiting = agentMilestones({ session: session({ waitingOn: 'q2' }), feed });
    expect(waiting.filter((m) => m.open).map((m) => m.at)).toEqual([1200]);
    expect(agentMilestones({ session: session(), feed }).some((m) => m.open)).toBe(false);
  });

  test('leaves out other sessions, other tickets, notes and verification from before the claim', () => {
    const feed = [
      entry({ sessionId: 's2', kind: 'asks-you', signal: true }),
      entry({ sessionId: 's1', kind: 'asks-you', text: '#24: proposed new acceptance criteria' }),
      entry({ source: 'system', ticketId: 't9', kind: 'verified' }),
      entry({ at: 500, source: 'system', ticketId: 't24', kind: 'verified' }),
      entry({ sessionId: 's1', level: 'step', tag: 'Work 4/5', text: 'Record' }),
    ];
    expect(agentMilestones({ session: session(), feed }).map((m) => m.kind)).toEqual(['claimed']);
  });
});

describe('how long a lane has been on its ticket', () => {
  test('now, minutes, then hours and minutes', () => {
    expect(laneSince(20_000)).toBe('now');
    expect(laneSince(14 * 60_000)).toBe('14 min');
    expect(laneSince(66 * 60_000)).toBe('1 h 06');
  });
});

describe('the answered line under an answer in the chat', () => {
  const answer = (over: Partial<ChatMessage>) =>
    ({
      id: 'c',
      sessionId: 's',
      from: 'human',
      author: 'you',
      text: 'yes',
      at: 1,
      answers: 'q1',
      ...over,
    }) as ChatMessage;
  test('names where the answer that counts was given', () => {
    expect(answeredLine(answer({ via: 'lookout' }))).toEqual(['Answered', 'in the Lookout']);
    expect(answeredLine(answer({ via: 'slack' }))).toEqual(['Answered', 'in Slack']);
  });
  test('nothing for guidance, an answer not used, a chat answer, an unlabelled one or an agent’s line', () => {
    expect(answeredLine(answer({ via: 'chat' }))).toBeUndefined();
    expect(answeredLine(answer({ via: 'lookout', guidance: true }))).toBeUndefined();
    expect(answeredLine(answer({ via: 'lookout', notUsed: true }))).toBeUndefined();
    expect(answeredLine(answer({}))).toBeUndefined();
    expect(answeredLine(answer({ via: 'lookout', answers: undefined }))).toBeUndefined();
    expect(answeredLine(answer({ via: 'lookout', from: 'agent' }))).toBeUndefined();
  });
});
