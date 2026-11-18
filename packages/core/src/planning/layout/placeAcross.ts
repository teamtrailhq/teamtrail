import type { Ticket } from '../../model/types';
import { laneWish } from './laneWish';
import { LAYOUT_SPACING } from './layoutSpacing';
import { placeLayer } from './placeLayer';
import { spreadRuns } from './spreadRuns';
import type { LaneLinks, LayoutDirection, LayoutLayer, Toward } from './types';

/**
 * Where every card sits across the trail (its top in LR, its left in TB), from 0. Each layer is placed after the one
 * before it, its cards at the median of their blockers, so a chain runs straight and a ticket alone in its layer lines
 * up with what it waits on; then the first layer lines up with what follows it, and the rest are placed again. A
 * wrapped layer moves as one block, centred on its blockers. Keeps each layer's order (`orderLayers`).
 */
export function placeAcross(input: { layers: LayoutLayer[]; direction: LayoutDirection }) {
  const { layers } = input;
  const { lane, across } = LAYOUT_SPACING[input.direction];
  const links = laneLinks(layers.flatMap((l) => l.tickets));
  const tops = new Map<string, number>();
  const place = (layer: LayoutLayer, toward: Toward) => {
    const ctx = { layer, toward, links, tops, lane };
    if (layer.subs > 1) placeGrid(ctx);
    else placeColumn(ctx);
  };
  for (const layer of layers) place(layer, 'blockers');
  if (layers.length > 1) {
    place(layers[0], 'blocked');
    for (const layer of layers.slice(1)) place(layer, 'blockers');
  }
  const start = tops.size ? Math.min(...tops.values()) : 0;
  for (const [id, top] of tops) tops.set(id, top - start);
  const span = Math.max(across, ...[...tops.values()].map((top) => top + across));
  return { tops, span };
}

interface PlaceCtx {
  layer: LayoutLayer;
  toward: Toward;
  links: LaneLinks;
  tops: Map<string, number>;
  lane: number;
}

function placeColumn(ctx: PlaceCtx) {
  const { layer, lane } = ctx;
  const wishes = layer.tickets.map((ticket) => laneWish({ ...ctx, ticket, layer: layer.tickets }));
  const spots = placeLayer({ wishes: spreadRuns({ wishes, lane }), lane });
  layer.tickets.forEach((t, i) => ctx.tops.set(t.id, spots[i]));
}

/** A wrapped layer: its grid centred on the median of every card it connects to on that side, or where it was. */
function placeGrid(ctx: PlaceCtx) {
  const { layer, links, tops, lane } = ctx;
  const near = layer.tickets.flatMap((t) => links[ctx.toward].get(t.id) ?? []);
  const spots = near.map((id) => tops.get(id)).filter((v): v is number => v !== undefined);
  const first = tops.get(layer.tickets[0].id) ?? 0;
  const centre = spots.length ? middle(spots) : first + ((layer.lanes - 1) * lane) / 2;
  const top = centre - ((layer.lanes - 1) * lane) / 2;
  layer.tickets.forEach((t, i) => tops.set(t.id, top + (i % layer.lanes) * lane));
}

/** Halfway between the outermost cards, so a grid sits centred on a fan of blockers. */
function middle(values: number[]) {
  return (Math.min(...values) + Math.max(...values)) / 2;
}

function laneLinks(tickets: Ticket[]): LaneLinks {
  const on = new Set(tickets.map((t) => t.id));
  const blockers = new Map<string, string[]>();
  const blocked = new Map<string, string[]>();
  for (const t of tickets) {
    const own = [...new Set(t.blockedBy)].filter((b) => on.has(b) && b !== t.id);
    blockers.set(t.id, own);
    for (const b of own) blocked.set(b, [...(blocked.get(b) ?? []), t.id]);
  }
  return { blockers, blocked };
}
