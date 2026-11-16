import { describe, expect, it } from 'vitest';
import type { ScorecardTicket } from '../src/model/scorecard';
import { DEFAULT_TIER_MAP } from '../src/planning/matching/defaultTierMap';
import { agentScorecard } from '../src/scorecard/agentScorecard';
import { scorecardMarkdown } from '../src/scorecard/scorecardMarkdown';
import { tierSuggestions } from '../src/scorecard/tierSuggestions';

const none = { info: 0, warn: 0, error: 0 };
let n = 0;

/** A ticket whose first completion came from `session`, with these results in order. */
function ticket(type: string, session: string, results: ('pass' | 'fail')[], verified = results.at(-1) === 'pass') {
  n += 1;
  return {
    mapId: 'm',
    ticketId: String(n),
    type,
    verified,
    attempts: results.map((result) => ({ agent: session.split(':')[0], sessionId: session, result })),
    findings: none,
  } satisfies ScorecardTicket;
}

const many = (count: number, make: () => ScorecardTicket) => Array.from({ length: count }, make);

describe('agentScorecard', () => {
  it('credits each ticket to its first completion and measures first time, rework and cost per verified', () => {
    const tickets = [
      ticket('task', 'claude-01:s1', ['pass']),
      ticket('task', 'claude-01:s1', ['fail', 'pass']),
      ticket('task', 'codex-02:s2', ['fail']),
    ];
    const card = agentScorecard({
      tickets,
      sessions: [
        { id: 'claude-01:s1', model: 'claude-sonnet-5-5', costUsd: 2 },
        { id: 'codex-02:s2', model: 'gpt-5.2-codex', costUsd: 1 },
      ],
      minSample: 2,
    });
    const sonnet = card.byModel.find((r) => r.key === 'claude-sonnet-5-5')!;
    expect(sonnet).toMatchObject({
      tickets: 2,
      verified: 2,
      verifiedFirstTime: 1,
      firstTimeRate: 0.5,
      reworkRate: 0.5,
      attemptsPerVerified: 1.5,
      costUsd: 2,
      costPerVerifiedUsd: 1,
      enough: true,
    });
    const codex = card.byModel.find((r) => r.key === 'gpt-5.2-codex')!;
    expect(codex).toMatchObject({ tickets: 1, verified: 0, costPerVerifiedUsd: undefined, enough: false });
    expect(card.byVendor.map((r) => r.key)).toEqual(['claude', 'codex']);
    expect(card.byTypeAndModel[0]).toMatchObject({ key: 'task · claude-sonnet-5-5', type: 'task' });
  });

  it('is deterministic and counts a session with no model as unknown', () => {
    const tickets = [ticket('research', 'x-1:s9', ['pass'])];
    const a = agentScorecard({ tickets, sessions: [] });
    expect(agentScorecard({ tickets, sessions: [] })).toEqual(a);
    expect(a.byModel[0].key).toBe('unknown model');
    expect(a.byModel[0].enough).toBe(false);
  });
});

describe('tierSuggestions', () => {
  it('suggests the tier of the model that does best on a type, only with enough tickets from two models', () => {
    const tickets = [
      ...many(8, () => ticket('task', 'codex-01:a', ['pass'])),
      ...many(2, () => ticket('task', 'codex-01:a', ['fail', 'pass'])),
      ...many(6, () => ticket('task', 'claude-02:b', ['pass'])),
      ...many(4, () => ticket('task', 'claude-02:b', ['fail', 'pass'])),
      ...many(3, () => ticket('research', 'claude-02:b', ['pass'])),
    ];
    const scorecard = agentScorecard({
      tickets,
      sessions: [
        { id: 'codex-01:a', model: 'gpt-5.2-codex' },
        { id: 'claude-02:b', model: 'claude-haiku-5-5' },
      ],
    });
    const tiers = { ...DEFAULT_TIER_MAP, task: 'fast' as const };
    expect(tierSuggestions({ scorecard, tiers })).toEqual([
      {
        type: 'task',
        current: 'fast',
        tier: 'strongest',
        model: 'gpt-5.2-codex',
        because:
          'gpt-5.2-codex passes 80% of your task tickets first time (10 tickets); claude-haiku-5-5 passes 60% of your task tickets first time (10 tickets)',
      },
    ]);
    expect(tierSuggestions({ scorecard, tiers: { ...tiers, task: 'strongest' } })).toEqual([]);
  });
});

describe('scorecardMarkdown', () => {
  it('is a table anyone can read, and model names stay plain text', () => {
    const scorecard = agentScorecard({
      tickets: [ticket('task', 'claude-01:s', ['pass'])],
      sessions: [{ id: 'claude-01:s', model: 'evil|[x](http://e)' }],
    });
    const md = scorecardMarkdown(scorecard);
    expect(md).toContain('| Ticket type · model | Tickets | Verified first time |');
    expect(md).toContain('| task · evilxhttp//e (too few) | 1 | 100% |');
  });
});

describe('the scorecard by guide', () => {
  it('counts a ticket under every guide of its latest attempt, and leaves out tickets from before guides', () => {
    const withGuides = (t: ScorecardTicket, guides: string[]) => ({ ...t, guides });
    const card = agentScorecard({
      tickets: [
        withGuides(ticket('task', 'claude-01:s1', ['pass']), ['qa', 'security']),
        withGuides(ticket('task', 'claude-01:s1', ['fail', 'pass']), ['qa']),
        ticket('task', 'claude-01:s1', ['pass']),
      ],
      sessions: [],
      minSample: 2,
    });
    expect(card.byGuide.map((r) => [r.key, r.guide, r.tickets, r.verifiedFirstTime])).toEqual([
      ['qa', 'qa', 2, 1],
      ['security', 'security', 1, 1],
    ]);
    expect(scorecardMarkdown(card)).toContain('| Guide | Tickets');
  });
});
