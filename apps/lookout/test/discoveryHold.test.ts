import type { LaidOutNode, Ticket } from '@teamtrail/core';
import { describe, expect, test } from 'vitest';
import { discoveryHolds } from '../src/features/discovery/discoveryHolds';
import { briefWait } from '../src/features/map/briefWait';
import { nodeTone } from '../src/features/map/nodeTone';
import { statePart } from '../src/features/map/statePart';

const ticket = (type: Ticket['type'], state: Ticket['state'] = 'open') => ({ type, state });
const node = (state: LaidOutNode['state']) => ({ state, ticket: { assignee: undefined } }) as unknown as LaidOutNode;

describe('tickets the discovery gate holds', () => {
  test('open implementation tickets, while discovery still gates the trail', () => {
    expect(discoveryHolds(true, ticket('task'))).toBe(true);
    expect(discoveryHolds(true, ticket('execute'))).toBe(true);
    expect(discoveryHolds(true, ticket('prototype'))).toBe(true);
  });

  test('never discovery work, closed tickets, or a trail whose brief was accepted', () => {
    expect(discoveryHolds(true, ticket('research'))).toBe(false);
    expect(discoveryHolds(true, ticket('junction'))).toBe(false);
    expect(discoveryHolds(true, ticket('review'))).toBe(false);
    expect(discoveryHolds(true, ticket('task', 'closed'))).toBe(false);
    expect(discoveryHolds(false, ticket('task'))).toBe(false);
  });
});

describe('a held card on the map', () => {
  test('a ready card waits on the brief, amber, not "ready for an agent"', () => {
    const held = briefWait(node('frontier'), true, false);
    expect(held).toBe(true);
    expect(statePart({ n: node('frontier'), waiting: false, brief: held, step: true })).toEqual({
      text: 'waits on brief',
      tone: 'warn',
    });
    expect(nodeTone({ state: 'frontier', live: false, attention: held })).toBe('attention');
  });

  test('a card in the backlog stays there; an agent waiting on you still comes first', () => {
    expect(briefWait(node('blocked'), true, false)).toBe(false);
    expect(briefWait(node('frontier'), undefined, false)).toBe(false);
    expect(statePart({ n: node('frontier'), waiting: true, brief: true, step: true }).text).toBe('waiting on you');
  });
});
