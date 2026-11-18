import { layout, type MapMode, type Ticket } from '@teamtrail/core';
import { useMemo } from 'react';
import { destinationSpot } from './destination';
import { mainRoom } from './mainSpot';

export const PAD = 32;
const LR_PREFERENCE = 1.8;

/**
 * The trail laid out for a box of `size`: left to right unless top to bottom fits much better, the spare height
 * between the graph and the out-of-scope strip, the destination after the last tickets and room for `main` before
 * the first. `W`, `H` are the whole map's size; `room` is how far `main` moved the trail over.
 */
export function useMapLayout(input: {
  tickets: Ticket[];
  mode: MapMode;
  size: { w: number; h: number };
  minFit?: number;
  main: boolean;
}) {
  const { tickets, mode, size } = input;
  const base = useMemo(() => {
    const lr = layout(tickets, 'LR', mode);
    const tb = layout(tickets, 'TB', mode);
    const fit = (l: typeof lr) => Math.min(size.w / (l.width + PAD * 2), size.h / (l.height + PAD * 2 + 16));
    // A trail reads best left to right, so it only turns vertical when that fits much better.
    return fit(lr) * LR_PREFERENCE >= fit(tb) ? lr : tb;
  }, [tickets, mode, size.w, size.h]);
  const fitK = (w: number, h: number) => Math.min(1.25, Math.max(input.minFit ?? 0, Math.min(size.w / w, size.h / h)));

  // Out-of-scope strip sits on the bottom edge of the zone: the spare height at fit goes between the graph and it.
  const L = useMemo(() => {
    const W0 = base.width + PAD * 2;
    const H0 = base.height + PAD * 2 + 16;
    const hasOos = base.nodes.some((n) => n.state === 'out-of-scope');
    const slack = hasOos && size.h ? Math.max(0, size.h / fitK(W0, H0) - H0) : 0;
    if (!slack) return { ...base, slack };
    const moved = new Map(
      base.nodes.map((n) => [n, { ...n, y: n.y + (n.state === 'out-of-scope' ? slack : slack / 2) }]),
    );
    return {
      ...base,
      slack,
      nodes: [...moved.values()],
      edges: base.edges.map((e) => ({ from: moved.get(e.from)!, to: moved.get(e.to)! })),
      groups: base.groups.map((g) => ({ ...g, y: g.y + slack / 2 })),
      quarantineY: base.quarantineY + slack,
      height: base.height + slack,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, size.w, size.h, input.minFit]);
  const destination = destinationSpot(L);
  const room = mainRoom(L.direction, input.main);
  const W = destination.right + PAD * 2 + room.x;
  const H = destination.bottom + PAD * 2 + 16 + room.y;
  return { L, destination, room, W, H, fitK };
}
