import { describe, expect, it } from 'vitest';
import { layout, LAYOUT_SPACING, NODE_H, NODE_W, type Ticket, WRAP_AFTER } from '../src';
import { wrapLayers } from '../src/planning/layout/wrapLayers';

const ticket = (n: number, patch: Partial<Ticket> = {}): Ticket => ({
  id: String(n),
  key: `#${n}`,
  title: `Ticket ${n}`,
  type: 'task',
  body: '',
  state: 'open',
  blockedBy: [],
  comments: [],
  // created in reverse, so creation order isn't number order
  createdAt: 1_000_000 - n,
  updatedAt: 1_000_000 - n,
  ...patch,
});
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe('wrapLayers', () => {
  it('leaves a layer of up to six tickets as one column', () => {
    expect(wrapLayers({ sizes: [WRAP_AFTER], direction: 'LR' })).toEqual([1]);
    expect(wrapLayers({ sizes: [1, WRAP_AFTER, 2], direction: 'LR' })).toEqual([1, 1, 1]);
  });

  it('wraps a big layer until the map is wide enough, and only that layer', () => {
    expect(wrapLayers({ sizes: [38], direction: 'LR' })).toEqual([6]);
    expect(wrapLayers({ sizes: [1, 20, 1], direction: 'LR' })).toEqual([1, 3, 1]);
  });

  it('leaves a big layer alone when the map is already long enough', () => {
    expect(wrapLayers({ sizes: [1, 1, 1, 1, 1, 1, 1, 1, 9], direction: 'LR' })).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
  });

  it('wraps into sub-rows top to bottom, toward a portrait shape', () => {
    const [subs] = wrapLayers({ sizes: [38], direction: 'TB' });
    expect(subs).toBeGreaterThan(1);
    const lanes = Math.ceil(38 / subs);
    const s = LAYOUT_SPACING.TB;
    expect((subs - 1) * s.sub + s.along).toBeGreaterThanOrEqual(s.aspect * ((lanes - 1) * s.lane + s.across));
  });
});

describe('layout', () => {
  it('lays a wide layer out as a grid, in order of number, one sub-column after another', () => {
    const tickets = range(1, 38).map((n) => ticket(n));
    const l = layout(tickets, 'LR');
    expect(l.groups).toHaveLength(1);
    const [g] = l.groups;
    expect(g).toMatchObject({ layer: 0, subs: 6, lanes: 7 });
    const columns = new Set(l.nodes.map((n) => n.x));
    expect(columns.size).toBe(6);
    const reading = [...l.nodes].sort((a, b) => a.x - b.x || a.y - b.y).map((n) => n.ticket.key);
    expect(reading).toEqual(range(1, 38).map((n) => `#${n}`));
    expect(l.width).toBeGreaterThanOrEqual(LAYOUT_SPACING.LR.aspect * l.graphH);
    expect(g.w).toBe(5 * LAYOUT_SPACING.LR.sub + NODE_W);
    expect(g.h).toBe(6 * LAYOUT_SPACING.LR.lane + NODE_H);
    expect(l.nodes.every((n) => n.wrap?.group === 0)).toBe(true);
  });

  it('keeps a small trail exactly as before: one column per layer', () => {
    const tickets = [ticket(1), ticket(2, { blockedBy: ['1'] }), ticket(3, { blockedBy: ['1'] })];
    const l = layout(tickets, 'LR');
    expect(l.groups).toEqual([]);
    expect(l.nodes.map((n) => [n.ticket.id, n.x, n.y])).toEqual([
      ['1', 0, 56],
      ['3', 330, 0],
      ['2', 330, 112],
    ]);
    expect(l.width).toBe(530);
    expect(l.graphH).toBe(168);
  });

  it('moves later layers past a wrapped one', () => {
    const tickets = [
      ticket(1),
      ...range(2, 21).map((n) => ticket(n, { blockedBy: ['1'] })),
      ticket(22, { blockedBy: ['2', '21'] }),
    ];
    const l = layout(tickets, 'LR');
    const [g] = l.groups;
    expect(g.layer).toBe(1);
    const last = l.nodes.find((n) => n.ticket.id === '22')!;
    expect(last.x).toBe(g.x + g.w + (LAYOUT_SPACING.LR.layer - NODE_W));
    expect(l.width).toBe(last.x + NODE_W);
  });

  it('wraps top to bottom into sub-rows, filling each row in turn', () => {
    const l = layout(
      range(1, 20).map((n) => ticket(n)),
      'TB',
    );
    const [g] = l.groups;
    expect(g.subs).toBeGreaterThan(1);
    const rows = new Set(l.nodes.map((n) => n.y));
    expect(rows.size).toBe(g.subs);
    const reading = [...l.nodes].sort((a, b) => a.y - b.y || a.x - b.x).map((n) => n.ticket.key);
    expect(reading).toEqual(range(1, 20).map((n) => `#${n}`));
  });

  it('keeps out-of-scope tickets in the strip, not in the grid', () => {
    const tickets = [
      ...range(1, 12).map((n) => ticket(n)),
      ticket(13, { state: 'closed', closeReason: 'not_planned' }),
    ];
    const l = layout(tickets, 'LR');
    const ruled = l.nodes.find((n) => n.ticket.id === '13')!;
    expect(ruled.wrap).toBeUndefined();
    expect(ruled.y).toBe(l.quarantineY);
  });
});
