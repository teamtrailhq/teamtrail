import type { LaidOutNode } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { openingView } from '../src/features/map/openingView';

const node = (state: string, x: number, y: number, id = `${x}-${y}`) =>
  ({ state, x, y, ticket: { id } }) as unknown as LaidOutNode;
const size = { w: 800, h: 400 };

describe('openingView', () => {
  it('shows the whole trail when it fits at a readable size', () => {
    const fit = { k: 1, x: 10, y: 20 };
    expect(openingView({ fit, nodes: [node('frontier', 0, 0)], size, pad: 32 })).toBe(fit);
  });

  it('otherwise centres a readable zoom on the work in progress', () => {
    const fit = { k: 0.3, x: 0, y: 0 };
    const nodes = [node('decided', 0, 0), node('frontier', 300, 0), node('claimed', 600, 100)];
    const view = openingView({ fit, nodes, size, pad: 32 });
    expect(view.k).toBeGreaterThan(fit.k);
    expect(view.x + (600 + 32 + 100) * view.k).toBeCloseTo(size.w / 2);
    expect(view.y + (100 + 32 + 28) * view.k).toBeCloseTo(size.h / 2);
  });

  it('never opens below a readable zoom (titles about 11px)', () => {
    const view = openingView({ fit: { k: 0.4, x: 0, y: 0 }, nodes: [node('claimed', 0, 0)], size, pad: 32 });
    expect(view.k * 11.5).toBeGreaterThanOrEqual(10.9);
  });

  it('opens on what needs you, most urgent first, clear of the room kept for the bubble', () => {
    const fit = { k: 0.3, x: 0, y: 0 };
    const nodes = [node('claimed', 0, 0, 'a'), node('frontier', 3000, 0, 'b')];
    const view = openingView({ fit, nodes, size: { w: 1400, h: 600 }, pad: 32, focus: ['b'], room: 390 });
    // #b alone fits: its centre sits in the middle of the 1010px left of the bubble's room
    expect(view.x + (3000 + 32 + 100) * view.k).toBeCloseTo(505);
  });
});
