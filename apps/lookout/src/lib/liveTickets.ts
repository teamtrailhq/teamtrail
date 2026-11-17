import {
  attention,
  deriveStates,
  type AttentionItem,
  type MapSnapshot,
  type SessionInfo,
  type Ticket,
} from '@teamtrail/core';

/**
 * Where each ticket is right now, one word each, so the map, the trail bar and the bubble agree: done, an agent at
 * work, needs you (an agent asked, or the queue holds something on it), waiting for an agent to pick it up, not
 * started yet (waits on other tickets, the brief or a stronger model), or ruled out.
 */
export type LiveTone = 'done' | 'working' | 'needs' | 'waiting-agent' | 'not-started' | 'cancelled';

export interface LiveTicket {
  ticket: Ticket;
  tone: LiveTone;
  /** The agent session on it. */
  session?: SessionInfo;
  /** The queue's items on it, most urgent first. */
  items: AttentionItem[];
  /** Waiting for an agent: since when it could be picked up. */
  readySince?: number;
  /** Not started: the open tickets it waits on (keys), and those of them that wait on you. */
  waitsOn: string[];
  waitsOnYours: string[];
}

/** What else holds a ready ticket back: the discovery brief, or a stronger model than any connected agent runs. */
export type HeldBack = (t: Ticket) => boolean;

/** Since when a ticket could be picked up: its creation, or the last of its blockers to close. */
function readySince(t: Ticket, byId: Map<string, Ticket>) {
  const closed = t.blockedBy.map((b) => byId.get(b)?.closedAt ?? 0);
  return Math.max(t.createdAt, ...closed);
}

function baseTone(input: {
  t: Ticket;
  state: string;
  session?: SessionInfo;
  items: AttentionItem[];
  held: boolean;
}): LiveTone {
  const { t, state, session, items } = input;
  if (state === 'out-of-scope') return 'cancelled';
  if (items.length || session?.waitingOn) return 'needs';
  if (state === 'decided') return 'done';
  if (session || state === 'claimed' || state === 'verifying') return 'working';
  const ready = state === 'frontier' || state === 'rework';
  if (ready && !t.assignee && attention(t) !== 'hitl' && !input.held) return 'waiting-agent';
  return 'not-started';
}

/**
 * Every ticket of a trail, read into its live tone. `sessions` are the running sessions on the trail; `items` the
 * queue's items (any trail: only this trail's count).
 */
export function liveTickets(input: {
  snap: MapSnapshot;
  sessions: SessionInfo[];
  items: AttentionItem[];
  heldBack?: HeldBack;
}): Map<string, LiveTicket> {
  const { snap } = input;
  const states = deriveStates(snap.tickets, snap.map.mode);
  const byId = new Map(snap.tickets.map((t) => [t.id, t]));
  const mine = input.items.filter((i) => i.mapId === snap.map.id && i.ticketId);
  const first = snap.tickets.map((t) => {
    const items = mine.filter((i) => i.ticketId === t.id);
    const session = input.sessions.find((s) => s.ticketId === t.id && s.mapId === snap.map.id);
    const held = input.heldBack?.(t) ?? false;
    const tone = baseTone({ t, state: states.get(t.id)!, session, items, held });
    return { ticket: t, tone, session, items };
  });
  const toneOf = new Map(first.map((l) => [l.ticket.id, l.tone]));
  return new Map(
    first.map((l) => {
      const open = l.ticket.blockedBy.filter((b) => byId.get(b)?.state === 'open');
      const needsYou = open.filter((b) => toneOf.get(b) === 'needs');
      const live: LiveTicket = {
        ...l,
        readySince: l.tone === 'waiting-agent' ? readySince(l.ticket, byId) : undefined,
        waitsOn: l.tone === 'not-started' ? open.map((b) => byId.get(b)!.key) : [],
        waitsOnYours: l.tone === 'not-started' ? needsYou.map((b) => byId.get(b)!.key) : [],
      };
      return [l.ticket.id, live];
    }),
  );
}
