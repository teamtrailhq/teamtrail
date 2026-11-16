import type { InstalledGuide } from '../model/guide';
import type { MapDoc, Ticket } from '../model/types';
import { effectiveChecks, resolveGuide, type ResolvedGuide } from './resolveGuide';
import { ticketGuideIds, type TicketGuideRef } from './ticketGuideIds';

/** One of a ticket's guides as it can be used now, with where it came from. */
export type ResolvedTicketGuide = Exclude<ResolvedGuide, { kind: 'none' }> & { via: TicketGuideRef['via'] };

/** Every guide `t` takes on (ticketGuideIds.ts), each active or disabled with the reason, as resolveGuide says. */
export function resolveGuides(
  guides: InstalledGuide[],
  at: { map: Pick<MapDoc, 'guides' | 'guidesByType'>; ticket: Ticket },
): ResolvedTicketGuide[] {
  return ticketGuideIds(at.map, at.ticket).flatMap((ref) => {
    const r = resolveGuide(guides, { guide: ref.id });
    return r.kind === 'none' ? [] : [{ ...r, via: ref.via }];
  });
}

/** `base` with every guide's required checks appended: the union, add-only, in the order the guides come. */
export const checksOfGuides = (base: string[], list: ResolvedGuide[]) => list.reduce(effectiveChecks, base);

/** The id of a resolved guide, active or not. */
export const resolvedId = (r: ResolvedTicketGuide) => (r.kind === 'active' ? r.guide.id : r.id);
