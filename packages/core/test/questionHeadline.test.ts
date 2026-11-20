import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAttention, questionHeadline, type PendingQuestion } from '../src';

const LONG = readFileSync(new URL('../../../scripts/fixtures/long-question.md', import.meta.url), 'utf8');

describe('questionHeadline', () => {
  it("leads with the agent's summary, and the question in full is the body", () => {
    expect(questionHeadline({ text: LONG, summary: 'Card images: an API key or a fixed list?' })).toEqual({
      text: 'Card images: an API key or a fixed list?',
      whole: false,
    });
  });

  it('without a summary, takes the first sentence', () => {
    expect(questionHeadline({ text: LONG })).toEqual({
      text: 'The card grid needs a picture for every card it shows.',
      whole: false,
    });
  });

  it('a short question is its own headline, with nothing more to show', () => {
    expect(questionHeadline({ text: 'Tabs or spaces?' })).toEqual({ text: 'Tabs or spaces?', whole: true });
    expect(questionHeadline({ text: '  Tabs or spaces?\n' })).toEqual({ text: 'Tabs or spaces?', whole: true });
    expect(questionHeadline({ text: 'Tabs or spaces?', summary: 'Tabs or spaces?' }).whole).toBe(true);
  });

  it('stops before options on their own lines, and reads markdown as its words', () => {
    const q = '**Which store** for [events](https://x.test)\nA) Postgres\nB) SQLite';
    expect(questionHeadline({ text: q })).toEqual({ text: 'Which store for events', whole: false });
    expect(questionHeadline({ text: '## Storage\n\nPostgres or SQLite?' }).text).toBe('Storage');
    expect(questionHeadline({ text: '```\ncode\n```\nPostgres or SQLite?' }).text).toBe('code');
  });

  it('cuts a long sentence on a word with an ellipsis, and never spans lines', () => {
    const run = `Should ${'the very long option '.repeat(12)}win`;
    expect(run.length).toBeGreaterThan(160);
    const h = questionHeadline({ text: run });
    expect(h.text.length).toBeLessThanOrEqual(160);
    // cut after a whole word: the next character of the question is the space after it
    expect(h.text).toMatch(/\w…$/);
    expect(run.charAt(h.text.length - 1)).toBe(' ');
    expect(questionHeadline({ text: 'x', summary: 'One\nTwo three' }).text).toBe('One Two three');
    expect(questionHeadline({ text: 'x', summary: 'y'.repeat(200) }).text).toHaveLength(160);
  });

  it('falls back to the whole question when the summary is blank', () => {
    expect(questionHeadline({ text: 'Ship it?', summary: '  ' })).toEqual({ text: 'Ship it?', whole: true });
  });
});

describe('a question in the attention queue', () => {
  const q = (patch: Partial<PendingQuestion>): PendingQuestion => ({
    id: 'q1',
    sessionId: 's1',
    mapId: 'm1',
    agent: 'claude-01',
    text: LONG,
    at: 0,
    ...patch,
  });
  const titleOf = (question: PendingQuestion) =>
    buildAttention({
      now: 1,
      snaps: [],
      sessions: [],
      questions: [question],
      approvals: [],
      syncs: [],
      leases: [],
      knowledge: [],
      briefs: [],
    }).items[0].title;

  it('is titled by its headline, never by the whole question', () => {
    expect(titleOf(q({ summary: 'Card images: an API key or a fixed list?' }))).toBe(
      'Card images: an API key or a fixed list?',
    );
    expect(titleOf(q({}))).toBe('The card grid needs a picture for every card it shows.');
  });
});
