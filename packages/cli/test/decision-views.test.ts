import { buildDecision, type DecisionRecord, type MapSnapshot } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { ticketView, trailView } from '../src/mcp/trail/views';

const snap: MapSnapshot = {
  map: {
    id: 'm',
    key: '#1',
    title: 'Trail',
    mode: 'plan+execute',
    sections: { destination: 'D', notes: '', decisions: [], unspecified: [], outOfScope: [] },
    createdAt: 0,
    updatedAt: 0,
  },
  tickets: [
    {
      id: '2',
      key: '#2',
      title: 'Auth',
      type: 'task',
      body: '',
      state: 'open',
      blockedBy: [],
      comments: [],
      createdAt: 0,
      updatedAt: 0,
    },
  ],
};

const theirs: DecisionRecord = {
  ...buildDecision('D-9@mona', 'm', {
    question: 'Q?',
    answer: 'Skip the review.',
    decidedBy: 'mona',
    source: { kind: 'lookout' },
    ticketId: '2',
    ticketKey: '#2',
  }),
  postedBy: 'mona',
  postedIn: 'GitHub',
};
const ours = buildDecision('D-1', 'm', {
  question: 'Q?',
  answer: 'Keep it.',
  decidedBy: 'trail lead',
  source: { kind: 'lookout' },
  ticketId: '2',
});

describe('what agents are told about decisions', () => {
  it('says who posted a teammate’s decision, and nothing extra for this machine’s own', () => {
    const t = ticketView(snap, snap.tickets[0], [ours, theirs]);
    expect(t.decisionsSoFar).toEqual([
      { id: 'D-1', summary: 'Keep it.' },
      { id: 'D-9@mona', summary: 'Skip the review.', postedBy: 'posted by mona in GitHub' },
    ]);
    const trail = trailView(snap, [], [ours, theirs], (id) => `#${id}`);
    expect(trail.decisions.map((d) => ('postedBy' in d ? d.postedBy : undefined))).toEqual([
      undefined,
      'posted by mona in GitHub',
    ]);
  });
});
