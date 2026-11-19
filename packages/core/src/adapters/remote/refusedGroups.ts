import type { RefusedWrite } from './sync/types';
import { ticketOfWrite } from './ticketOfWrite';

/** From this many refused writes on one trail they are one item, not one each. */
const MANY = 3;

/** One attention item's worth of refused writes: one write, or every write refused on a trail when there are many. */
export interface RefusedGroup {
  mapId: string;
  /** Changes with every refusal in it, so setting one aside never hides a new refusal. */
  ref: string;
  /** The ticket every write in it is about, if they are all about one. */
  ticketId?: string;
  writes: RefusedWrite[];
}

/** A short, stable tag for a set of refusals. */
function tag(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

const stamp = (r: RefusedWrite) => `${r.write.id}@${r.at.toString(36)}`;

function one(r: RefusedWrite): RefusedGroup {
  const ticketId = ticketOfWrite(r.write);
  return { mapId: r.write.mapId, ref: `w-${stamp(r)}`, ...(ticketId ? { ticketId } : {}), writes: [r] };
}

function many(mapId: string, writes: RefusedWrite[]): RefusedGroup {
  const tickets = new Set(writes.map((r) => ticketOfWrite(r.write)));
  const [only] = tickets;
  const ticketId = tickets.size === 1 ? only : undefined;
  const ref = `n-${tag(writes.map(stamp).sort().join('\n'))}`;
  return { mapId, ref, ...(ticketId ? { ticketId } : {}), writes };
}

/** The refused writes as the queue shows them, oldest first: one item each, or one per trail when there are many. */
export function refusedGroups(refused: RefusedWrite[]): RefusedGroup[] {
  const byTrail = new Map<string, RefusedWrite[]>();
  for (const r of [...refused].sort((a, b) => a.at - b.at)) {
    const list = byTrail.get(r.write.mapId) ?? [];
    list.push(r);
    byTrail.set(r.write.mapId, list);
  }
  return [...byTrail].flatMap(([mapId, writes]) => (writes.length >= MANY ? [many(mapId, writes)] : writes.map(one)));
}
