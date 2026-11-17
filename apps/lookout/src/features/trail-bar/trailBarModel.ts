import type { AttentionItem, Ticket } from '@teamtrail/core';
import type { LiveTicket, LiveTone } from '../../lib/liveTickets';

/** One segment of the trail bar: a ticket in the trail's order, coloured by its live tone. */
export interface TrailSegment {
  id: string;
  key: string;
  title: string;
  tone: Exclude<LiveTone, 'cancelled'>;
}

export interface TrailCounts {
  done: number;
  /** Tickets on the trail, less the ruled out. */
  total: number;
  working: number;
  /** Things that need you on this trail: items in the queue, with or without a ticket (checks on main, the brief). */
  needs: number;
  waiting: number;
  notStarted: number;
}

/** How deep a ticket sits in the trail: 0 for the first ones, one more than its deepest blocker. */
function depths(tickets: Ticket[]) {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const memo = new Map<string, number>();
  const depth = (id: string, seen: Set<string>): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return 0;
    seen.add(id);
    const blockers = byId.get(id)?.blockedBy.filter((b) => byId.has(b)) ?? [];
    const d = blockers.length ? 1 + Math.max(...blockers.map((b) => depth(b, seen))) : 0;
    memo.set(id, d);
    return d;
  };
  return new Map(tickets.map((t) => [t.id, depth(t.id, new Set())]));
}

/** The trail bar's segments, start to end of the trail, ruled-out tickets left out. */
export function trailSegments(live: Map<string, LiveTicket>): TrailSegment[] {
  const all = [...live.values()].filter((l) => l.tone !== 'cancelled');
  const depth = depths(all.map((l) => l.ticket));
  return all
    .map((l, i) => ({ l, i, d: depth.get(l.ticket.id) ?? 0 }))
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map(({ l }) => ({
      id: l.ticket.id,
      key: l.ticket.key,
      title: l.ticket.title,
      tone: l.tone as TrailSegment['tone'],
    }));
}

/** The trail in numbers: tickets per tone, and how many things on the trail need you. */
export function trailCounts(segments: TrailSegment[], needs: AttentionItem[]): TrailCounts {
  const n = (tone: TrailSegment['tone']) => segments.filter((s) => s.tone === tone).length;
  return {
    done: n('done'),
    total: segments.length,
    working: n('working'),
    needs: needs.length,
    waiting: n('waiting-agent'),
    notStarted: n('not-started'),
  };
}

/** The counts in words, empty ones left out: "5 of 13 done · 2 working · 3 need you · 1 waiting for an agent". */
export function countWords(c: TrailCounts): { text: string; urgent?: boolean }[] {
  const parts = [
    { n: c.working, text: `${c.working} working` },
    { n: c.needs, text: `${c.needs} need${c.needs === 1 ? 's' : ''} you`, urgent: true },
    { n: c.waiting, text: `${c.waiting} waiting for an agent` },
    { n: c.notStarted, text: `${c.notStarted} not started` },
  ];
  return [
    { text: `${c.done} of ${c.total} done` },
    ...parts.filter((p) => p.n > 0).map(({ text, urgent }) => ({ text, urgent })),
  ];
}
