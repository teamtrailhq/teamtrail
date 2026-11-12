import { deriveStates, type MapSnapshot } from '@teamtrail/core';
import { label, md } from '../blocks';
import { openButton } from '../blocks/kit';
import type { SlackContext } from './slackContext';
import { ticketCard, type Found } from './ticketCard';
import { trailWorld, type TrailWorld } from './trailWorld';

const keyOf = (s: string) => s.toLowerCase().replace(/^#/, '');

/** Tickets by key on any trail; else by title, the whole title first, then titles that contain the words. */
function findTickets(snaps: MapSnapshot[], arg: string): Found[] {
  const all = snaps.flatMap((snap) => snap.tickets.map((ticket) => ({ snap, ticket })));
  const a = keyOf(arg);
  const byKey = all.filter((f) => keyOf(f.ticket.key) === a);
  if (byKey.length) return byKey;
  const byTitle = all.filter((f) => f.ticket.title.toLowerCase() === a);
  return byTitle.length ? byTitle : all.filter((f) => f.ticket.title.toLowerCase().includes(a));
}

const row = (f: Found) => `*${label(f.ticket.key)}* ${label(f.ticket.title)} · ${label(f.snap.map.title)}`;

/** What's blocked on every trail, and by which open tickets. */
function blockedList(w: TrailWorld) {
  const lines = w.snaps.flatMap((snap) => {
    const states = deriveStates(snap.tickets, snap.map.mode);
    const byId = new Map(snap.tickets.map((t) => [t.id, t]));
    return snap.tickets
      .filter((t) => states.get(t.id) === 'blocked')
      .map((t) => {
        const by = t.blockedBy.map((b) => byId.get(b)).filter((b) => b && b.state === 'open');
        const tail = by.length ? ` · blocked by ${by.map((b) => label(b!.key)).join(', ')}` : '';
        return `${row({ snap, ticket: t })}${tail}`;
      });
  });
  if (!lines.length) return { text: 'Nothing is blocked.' };
  return {
    text: `${lines.length} blocked`,
    blocks: [{ type: 'section', text: md(lines.slice(0, 15).join('\n')) }],
  };
}

/**
 * `@Scout ticket #12`, "what's blocking #12?": one ticket's state, what blocks it and what it blocks, who's on it,
 * the questions waiting on you about it and its decision. No ticket named: what's blocked. Read-only.
 */
export async function ticketMessage(ctx: SlackContext, arg: string) {
  const w = await trailWorld(ctx);
  if (!arg) return blockedList(w);
  const found = findTickets(w.snaps, arg);
  if (!found.length) return { text: `No ticket matches “${label(arg)}”.` };
  if (found.length > 1)
    return {
      text: `${found.length} tickets match “${label(arg)}”`,
      blocks: [
        { type: 'section', text: md(found.slice(0, 8).map(row).join('\n')) },
        { type: 'context', elements: [md('Ask again with the ticket’s key.')] },
      ],
    };
  const card = await ticketCard(w, found[0]);
  const url = ctx.o.url();
  return url ? { ...card, blocks: [...card.blocks, { type: 'actions', elements: openButton(url) }] } : card;
}
