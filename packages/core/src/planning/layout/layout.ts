import { DEFAULT_MAP_MODE, type MapMode, type NodeState, type Ticket } from '../../model/types';
import { deriveStates } from '../derive';
import { byTicketNumber } from './byTicketNumber';
import { layerOf } from './layerOf';
import { LAYOUT_SPACING } from './layoutSpacing';
import { NODE_H, NODE_W } from './nodeSize';
import { placeAcross } from './placeAcross';
import type { LaidOutNode, LayoutDirection, LayoutGroup, LayoutLayer } from './types';
import { wrapLayers } from './wrapLayers';

/**
 * Layered layout: a ticket's layer is the length of its longest blocking chain. LR puts layers in columns, TB in
 * rows. A layer with many tickets that don't block each other wraps into a grid (`wrapLayers`), its tickets in order
 * of number, filling each sub-column (LR) or sub-row (TB) in turn; every other layer is ordered to reduce crossings.
 * Across the trail, each card lines up with what it waits on, so a chain runs straight (`placeAcross`). Out-of-scope tickets are pulled into a separate quarantine strip below the graph.
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
  const across = placeAcross({ layers, direction });

  const nodes: LaidOutNode[] = [];
  const groups: LayoutGroup[] = [];
  let along = 0;
  layers.forEach((layer, li) => {
    const at = (a: number, b: number) => (direction === 'LR' ? { x: a, y: b } : { x: b, y: a });
    const wrapped = layer.subs > 1;
    layer.tickets.forEach((t, i) => {
      const sub = Math.floor(i / layer.lanes);
      const wrap = wrapped ? { wrap: { group: groups.length, sub, subs: layer.subs } } : {};
      const p = at(along + sub * s.sub, across.tops.get(t.id) ?? 0);
      nodes.push({ ticket: t, state: states.get(t.id) as NodeState, layer: li, ...p, ...wrap });
    });
    if (wrapped) {
      const corner = at(along, across.tops.get(layer.tickets[0].id) ?? 0);
      const size = at((layer.subs - 1) * s.sub + s.along, (layer.lanes - 1) * s.lane + s.across);
      groups.push({ layer: li, ...corner, w: size.x, h: size.y, subs: layer.subs, lanes: layer.lanes });
    }
    along += (layer.subs - 1) * s.sub + s.layer;
  });

  const layersSpan = Math.max(along, s.layer) - (s.layer - s.along);
  const lanesSpan = across.span;
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
 * blockers' lanes, to reduce crossings, a review that waits on nothing right after the ticket it reviews.
 */
function orderLayers(byLayer: Ticket[][], direction: LayoutDirection): LayoutLayer[] {
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
      : [...tickets].sort(byBarycentre({ layer: tickets, barycentre }));
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

/** Orders a layer by barycentre, then age; a review of a ticket in the layer goes right after that ticket. */
function byBarycentre(input: { layer: Ticket[]; barycentre: (t: Ticket) => number }) {
  const { barycentre } = input;
  const byId = new Map(input.layer.map((t) => [t.id, t]));
  const anchor = (t: Ticket) => (t.type === 'review' && t.reviewOf && byId.get(t.reviewOf)) || t;
  return (a: Ticket, b: Ticket) => {
    const x = anchor(a);
    const y = anchor(b);
    if (x !== y) return barycentre(x) - barycentre(y) || x.createdAt - y.createdAt || x.id.localeCompare(y.id);
    return Number(a !== x) - Number(b !== y) || a.createdAt - b.createdAt;
  };
}
