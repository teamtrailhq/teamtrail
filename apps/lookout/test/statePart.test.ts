import type { LaidOutNode } from '@teamtrail/core';
import { describe, expect, test } from 'vitest';
import { statePart } from '../src/features/map/statePart';

const node = (state: LaidOutNode['state']) => ({ state, ticket: { assignee: undefined } }) as unknown as LaidOutNode;
const part = (state: LaidOutNode['state'], verified?: boolean) =>
  statePart({ n: node(state), waiting: false, step: true, verified });

describe("a map card's state, in words", () => {
  test('checks running while verifying; verified when its proof is; plain done otherwise', () => {
    expect(part('verifying')).toEqual({ text: 'checks running', tone: 'agent' });
    expect(part('decided', true)).toEqual({ text: 'verified', tone: 'verified' });
    expect(part('decided', false)).toEqual({ text: 'done', tone: '' });
    expect(part('decided')).toEqual({ text: 'done', tone: '' });
  });
});
