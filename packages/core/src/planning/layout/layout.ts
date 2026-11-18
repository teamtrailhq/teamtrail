import { DEFAULT_MAP_MODE, type MapMode, type NodeState, type Ticket } from '../../model/types';
import { deriveStates } from '../derive';
import { byTicketNumber } from './byTicketNumber';
import { layerOf } from './layerOf';
import { LAYOUT_SPACING } from './layoutSpacing';
import { NODE_H, NODE_W } from './nodeSize';
import type { LaidOutNode, LayoutDirection, LayoutGroup } from './types';
import { wrapLayers } from './wrapLayers';

/** One layer to place: its tickets in order, and how many lanes and sub-columns (LR) or sub-rows (TB) it takes. */
interface Layer {
  tickets: Ticket[];
  lanes: number;
  subs: number;
}

/**
 * Layered layout: a ticket's layer is the length of its longest blocking chain. LR puts layers in columns, TB in
 * rows. A layer with many tickets that don't block each other wraps into a grid (`wrapLayers`), its tickets in order
 * of number, filling each sub-column (LR) or sub-row (TB) in turn; every other layer is ordered to reduce crossings.
 * Out-of-scope tickets are pulled into a separate quarantine strip below the graph.
 */
export function layout(tickets: Ticket[], direction: LayoutDirection = 'LR', mode: MapMode = DEFAULT_MAP_MODE) {
  const s = LAYOUT_SPACING[direction];
  const states = deriveStates(tickets, mode);
  const active = tickets.filter((t) => states.get(t.id) !== 'out-of-scope');
  const ruled = tickets.filter((t) => states.get(t.id) === 'out-of-scope');
  const depth = layerOf(tickets);
  const byLayer: Ticket[][] = [];
  for (const t of active) (byLayer[depth(t.id)] ??= []).push(t);
  const layers = orderLayers(
    Array.from(byLayer, (l) => l ?? []),
    direction,
  );
  const maxLanes = Math.max(1, ...layers.map((l) => l.lanes));

  const nodes: LaidOutNode[] = [];
  const groups: LayoutGroup[] = [];
  let along = 0;
  layers.forEach((layer, li) => {
    const offset = ((maxLanes - layer.lanes) * s.lane) / 2;
    const at = (a: number, b: number) => (direction === 'LR' ? { x: a, y: b } : { x: b, y: a });
    const wrapped = layer.subs > 1;
    layer.tickets.forEach((t, i) => {
      const sub = Math.floor(i / layer.lanes);
      const wrap = wrapped ? { wrap: { group: groups.length, sub, subs: layer.subs } } : {};
      const p = at(along + sub * s.sub, offset + (i % layer.lanes) * s.lane);
      nodes.push({ ticket: t, state: states.get(t.id) as NodeState, layer: li, ...p, ...wrap });
    });
    if (wrapped) {
      const corner = at(along, offset);
      const size = at((layer.subs - 1) * s.sub + s.along, (layer.lanes - 1) * s.lane + s.across);
      groups.push({ layer: li, ...corner, w: size.x, h: size.y, subs: layer.subs, lanes: layer.lanes });
    }
    along += (layer.subs - 1) * s.sub + s.layer;
  });

  const layersSpan = Math.max(along, s.layer) - (s.layer - s.along);
  const lanesSpan = maxLanes * s.lane - (s.lane - s.across);
  const graphW = direction === 'LR' ? layersSpan : lanesSpan;
  const graphH = direction === 'LR' ? lanesSpan : layersSpan;
  const strip = quarantine({ ruled, graphW, graphH });
  nodes.push(...strip.nodes);

  const edges: { from: LaidOutNode; to: LaidOutNode }[] = [];
  const pos = new Map(nodes.map((n) => [n.ticket.id, n]));
  for (const n of nodes) {
    for (const b of n.ticket.blockedBy) {
      const from = pos.get(b);
      if (from) edges.push({ from, to: n });
    }
  }
  const { width, height, quarantineY, quarantineH } = strip;
  return { direction, nodes, edges, groups, width, graphH, quarantineY, height, quarantineH };
}

/**
 * Each layer's order, lanes and sub-columns: a wrapped layer by ticket number, any other by the barycentre of its
 * blockers' lanes, to reduce crossings.
 */
function orderLayers(byLayer: Ticket[][], direction: LayoutDirection): Layer[] {
  const subs = wrapLayers({ sizes: byLayer.map((l) => l.length), direction });
  const laneOf = new Map<string, number>();
  const barycentre = (t: Ticket) => {
    const ys = t.blockedBy.map((x) => laneOf.get(x)).filter((v): v is number => v !== undefined);
    return ys.length ? ys.reduce((sum, v) => sum + v, 0) / ys.length : t.createdAt / 1e12;
  };
  return byLayer.map((tickets, li) => {
    const lanes = Math.ceil(tickets.length / subs[li]);
    const wrapped = subs[li] > 1;
    const ordered = wrapped
      ? [...tickets].sort(byTicketNumber)
      : [...tickets].sort((a, b) => barycentre(a) - barycentre(b) || a.createdAt - b.createdAt);
    ordered.forEach((t, i) => laneOf.set(t.id, i % Math.max(lanes, 1)));
    return { tickets: ordered, lanes, subs: lanes ? Math.ceil(tickets.length / lanes) : 1 };
  });
}

/** The out-of-scope strip under the graph: its cards in rows as wide as the graph, and the map's size with it. */
function quarantine(input: { ruled: Ticket[]; graphW: number; graphH: number }) {
  const { ruled, graphW, graphH } = input;
  const quarantineY = graphH + 54;
  const perRow = Math.max(1, Math.floor((graphW + 24) / (NODE_W + 24)));
  const nodes: LaidOutNode[] = ruled.map((t, i) => ({
    ticket: t,
    state: 'out-of-scope',
    layer: -1,
    x: (i % perRow) * (NODE_W + 24),
    y: quarantineY + Math.floor(i / perRow) * (NODE_H + 16),
  }));
  const ruledRows = Math.ceil(ruled.length / perRow);
  const width = Math.max(graphW, Math.min(ruled.length, perRow) * (NODE_W + 24) - 24);
  const height = ruled.length ? quarantineY + ruledRows * (NODE_H + 16) - 16 : graphH;
  return { nodes, width, height, quarantineY, quarantineH: ruledRows * (NODE_H + 16) + 24 };
}
