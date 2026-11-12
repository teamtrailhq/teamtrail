import { auditDecisions, decisionStatus, deriveStates, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { label, md } from '../blocks';
import { decidedBy } from './decidedBy';
import { STATE_WORDS } from './stateWords';
import type { TrailWorld } from './trailWorld';

/** A ticket with the trail it is on. */
export type Found = { snap: MapSnapshot; ticket: Ticket };

const keys = (ts: Ticket[]) => ts.map((t) => `${label(t.key)} ${label(t.title)}`).join(', ');

/** Who is working on the ticket now: running sessions that claimed it. */
function onIt(w: TrailWorld, ticketId: string) {
  return w.docs
    .filter((d) => d.session.ticketId === ticketId && d.session.status === 'running')
    .map((d) => {
      const s = d.session;
      const waiting = d.pending.length || s.waitingOn ? ' · waiting on you' : '';
      return `${label(s.agent)} (${label(s.stepLabel)} ${s.step}/${s.total})${waiting}`;
    });
}

/** One ticket, as lines: the fields people ask about, each said once. */
export async function ticketCard(w: TrailWorld, f: Found) {
  const { snap, ticket: t } = f;
  const state = deriveStates(snap.tickets, snap.map.mode).get(t.id) ?? 'frontier';
  const open = snap.tickets.filter((x) => x.state === 'open');
  const blockers = open.filter((x) => t.blockedBy.includes(x.id));
  const blocks = open.filter((x) => x.blockedBy.includes(t.id));
  const agents = onIt(w, t.id);
  const waiting = w.docs.flatMap((d) => d.pending).filter((q) => q.ticketId === t.id).length;
  const records = await w.adapter.listDecisions(snap.map.id);
  const decision = auditDecisions(snap, records)
    .filter((d) => d.ticketId === t.id && decisionStatus(d) === 'active')
    .sort((a, b) => b.decidedAt - a.decidedAt)[0];
  const lines = [
    `*${label(t.key)} ${label(t.title)}* · ${label(t.type)} · ${label(snap.map.title)}`,
    `State: ${STATE_WORDS[state]}${t.assignee && !agents.length ? ` · claimed by ${label(t.assignee)}` : ''}`,
    ...(blockers.length ? [`Blocked by: ${keys(blockers)}`] : []),
    ...(blocks.length ? [`Blocks: ${keys(blocks)}`] : []),
    ...(agents.length ? [`On it: ${agents.join(', ')}`] : []),
    ...(waiting ? [`Waiting on you: ${waiting} question${waiting > 1 ? 's' : ''}`] : []),
    ...(decision ? [`Decision ${label(decision.id)}: ${label(decision.summary)} (${decidedBy(decision)})`] : []),
  ];
  return {
    text: `${label(t.key)} ${label(t.title)}: ${STATE_WORDS[state]}`,
    blocks: [{ type: 'section', text: md(lines.join('\n')) }],
  };
}
