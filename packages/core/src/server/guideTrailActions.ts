import type { IncomingMessage } from 'node:http';
import { guideProblem } from '../guides/guideProblem';
import { listGuides } from '../guides/guideStore';
import { trailGuidesByType } from '../guides/trailGuidesByType';
import type { InstalledGuide } from '../model/guide';
import { ALL_TICKET_TYPES, type GuidesByType, type TicketType } from '../model/types';
import { setTicketGuides, type TicketGuideChange } from '../planning/lifecycle/setTicketGuides';
import { setTrailGuides } from '../planning/lifecycle/setTrailGuides';
import { journalGuide } from './guideJournal';
import { BadRequest, readJson } from './http';
import type { RouteContext } from './routeContext';

type Body = { mapId?: unknown; ticketId?: unknown; add?: unknown; remove?: unknown; byType?: unknown };

const str = (v: unknown, name: string) => {
  if (typeof v !== 'string' || !v) throw new BadRequest(`"${name}" is required`);
  return v;
};

/** `byType` as sent: ticket types to lists of guide ids; anything else is refused. `null` puts back the defaults. */
function byTypeOf(v: unknown): GuidesByType | null {
  if (v === null) return null;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new BadRequest('"byType" must be an object or null');
  const out: GuidesByType = {};
  for (const [type, ids] of Object.entries(v as Record<string, unknown>)) {
    if (!ALL_TICKET_TYPES.includes(type as TicketType)) throw new BadRequest(`unknown ticket type "${type}"`);
    if (!Array.isArray(ids) || ids.some((x) => typeof x !== 'string')) throw new BadRequest(`"${type}" must list ids`);
    out[type as TicketType] = ids as string[];
  }
  return out;
}

/** Every guide newly put on a type must be usable now; ones already there may stay while disabled. */
function assertUsable(guides: InstalledGuide[], ids: string[]) {
  const problem = ids.map((id) => guideProblem(guides, id)).find(Boolean);
  if (problem) throw new BadRequest(problem);
}

/** The ticket's change: exactly one of `add` and `remove`. */
function changeOf(b: Body): TicketGuideChange {
  if (typeof b.add === 'string' && b.add) return { kind: 'add', id: b.add };
  if (typeof b.remove === 'string' && b.remove) return { kind: 'remove', id: b.remove };
  throw new BadRequest('"add" or "remove" is required');
}

/**
 * The trail lead's guides on a trail: `/guides/trail { mapId, byType|null }` sets its guides by type (null: the
 * defaults), `/guides/ticket { mapId, ticketId, add|remove }` adds a guide to one ticket or takes one off it. A guide
 * added must be active; any ticket type may take it. Both are journaled on the trail.
 */
export async function guideTrailAction(ctx: RouteContext, req: IncomingMessage, path: string) {
  const b = await readJson<Body>(req, '{}');
  const mapId = str(b.mapId, 'mapId');
  const adapter = await ctx.active();
  const guides = listGuides(ctx.root);
  if (path === '/guides/trail') {
    const byType = byTypeOf(b.byType);
    const before = trailGuidesByType((await adapter.loadMap(mapId)).map).byType;
    const added = Object.entries(byType ?? {}).flatMap(([type, ids]) =>
      ids!.filter((id) => !before[type]?.includes(id)),
    );
    assertUsable(guides, added);
    await setTrailGuides(adapter, mapId, byType, 'trail lead');
    const lines = Object.entries(trailGuidesByType({ guidesByType: byType ?? undefined }).byType)
      .filter(([, ids]) => ids.length)
      .map(([type, ids]) => `${type}: ${ids.join(', ')}`);
    const shown = byType ? lines.join('; ') || 'none' : 'defaults';
    return journalGuide(ctx.root, { action: 'trail-guides', guide: shown, mapId });
  }
  const ticketId = str(b.ticketId, 'ticketId');
  const change = changeOf(b);
  if (change.kind === 'add') assertUsable(guides, [change.id]);
  await setTicketGuides(adapter, { mapId, ticketId }, change, 'trail lead');
  journalGuide(ctx.root, { action: 'ticket-guides', guide: `${change.kind} ${change.id}`, mapId, ticketId });
}
