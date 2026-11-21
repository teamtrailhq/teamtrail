import type { LaidOutNode, Ticket } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { CARD_LABEL_ROOM } from '../src/features/map/cardLayout';
import { cardState } from '../src/features/map/cardState';
import { type CardLabelPart, fitLabel, labelWidth } from '../src/features/map/fitLabel';

const ticket = (patch: Partial<Ticket> = {}) =>
  ({ id: '24', key: '#24', title: 'Show synced', type: 'task', blockedBy: [], ...patch }) as unknown as Ticket;
const node = (state: LaidOutNode['state'], patch: Partial<Ticket> = {}) =>
  ({ ticket: ticket(patch), state, x: 0, y: 0 }) as unknown as LaidOutNode;
const base = { now: 0, marked: false, waiting: false, brief: false, needsYou: false, reserve: 0 };
const texts = (parts: CardLabelPart[]) => parts.map((p) => p.text);

describe('a card label line', () => {
  it('reads TYPE · #n · the state, each part in its tone', () => {
    const { parts } = cardState({ ...base, n: node('blocked'), waiting: true });
    expect(texts(parts)).toEqual(['Task', '#24', 'asks you']);
    expect(parts.map((p) => p.tone)).toEqual(['plain', 'plain', 'urgent']);
  });

  it("names the agent's model at work, in blaze", () => {
    const session = { agent: 'claude-05', model: 'claude-sonnet-4-5', step: 2, total: 5 };
    const live = { session, items: [], waitsOn: [], waitsOnYours: [] } as never;
    const { parts } = cardState({ ...base, n: node('claimed'), live });
    expect(texts(parts)).toEqual(['Task', '#24', 'Sonnet 4.5']);
    expect(parts[2].tone).toBe('agent');
  });

  it('marks a verified finish green', () => {
    const { parts } = cardState({ ...base, n: node('decided'), verified: true });
    expect(parts.at(-1)).toEqual({ text: 'verified', tone: 'ok' });
  });

  it('drops the type, then cuts the last part short, so it never passes the card edge', () => {
    const long = { ...base, n: node('blocked'), pr: 'PR #1234 merged', needsYou: true };
    const { parts } = cardState({ ...long, reserve: 60 });
    expect(texts(parts)[0]).toBe('#24');
    expect(labelWidth(parts)).toBeLessThanOrEqual(CARD_LABEL_ROOM - 60 + 0.01);
  });

  it('cuts with an ellipsis only when nothing fits whole', () => {
    const wide: CardLabelPart[] = [
      { text: '#9', tone: 'plain' },
      { text: 'a very long state that will not fit on any card at all', tone: 'dim' },
    ];
    const fitted = fitLabel([wide], 120);
    expect(fitted[1].text.endsWith('…')).toBe(true);
    expect(labelWidth(fitted)).toBeLessThanOrEqual(120);
    expect(fitLabel([[{ text: '#9', tone: 'plain' }]], 120)).toEqual([{ text: '#9', tone: 'plain' }]);
  });
});
