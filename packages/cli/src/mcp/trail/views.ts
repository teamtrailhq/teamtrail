import {
  attention,
  deriveStates,
  isHandoff,
  PHASE_OF,
  postedNote,
  type AgentSessionDoc,
  type Attention,
  type DecisionRecord,
  type MapSnapshot,
  type NodeState,
  type Ticket,
  type TicketType,
} from '@teamtrail/core';

/** A teammate's record says so: it is that person's decision, not the human's you work for. */
const posted = (d: DecisionRecord) => (d.postedBy ? { postedBy: postedNote(d) } : {});

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round = (n: number) => Math.round(n * 1e4) / 1e4;

export function ticketView(snap: MapSnapshot, t: Ticket, records: DecisionRecord[] = []) {
  const states = deriveStates(snap.tickets, snap.map.mode);
  const byId = new Map(snap.tickets.map((x) => [x.id, x]));
  const att = attention(t);
  const handoff = [...t.comments].reverse().find((c) => isHandoff(c.body));
  return {
    id: t.id,
    key: t.key,
    title: t.title,
    type: t.type,
    attention: att,
    state: states.get(t.id),
    phase: PHASE_OF[states.get(t.id)!],
    assignee: t.assignee,
    body: t.body,
    ...(t.reviewOf ? { reviews: byId.get(t.reviewOf)?.key ?? t.reviewOf } : {}),
    blockedBy: t.blockedBy.map((b) => ({
      key: byId.get(b)?.key ?? b,
      title: byId.get(b)?.title,
      state: states.get(b),
    })),
    decisionsFromBlockers: records
      .filter((d) => d.ticketId && t.blockedBy.includes(d.ticketId) && !d.supersededBy)
      .map((d) => ({ id: d.id, ticket: d.ticketKey, decision: d.answer, ...posted(d) })),
    decisionsSoFar: records
      .filter((d) => d.ticketId === t.id && !d.supersededBy)
      .map((d) => ({ id: d.id, summary: d.summary, ...posted(d) })),
    comments: t.comments.slice(-5).map((c) => ({ author: c.author, body: c.body })),
    ...(handoff && t.state === 'open'
      ? {
          resume: {
            note: 'A previous agent went silent on this ticket. Continue from its notes and decisions instead of starting over.',
            handoff: handoff.body,
          },
        }
      : {}),
    howTo: howTo(att, t.type),
  };
}

/** The `trail` part of `status`: progress, tickets by state, sessions, questions, decisions and spend. */
export function trailView(
  snap: MapSnapshot,
  docs: AgentSessionDoc[],
  records: DecisionRecord[],
  keyOf: (ticketId: string) => string,
) {
  const states = deriveStates(snap.tickets, snap.map.mode);
  const count = (st: NodeState) => snap.tickets.filter((t) => states.get(t.id) === st).length;
  const mine = docs.filter((d) => d.session.mapId === snap.map.id);
  const usage = mine.map((d) => d.session.usage).filter((u) => !!u);
  return {
    id: snap.map.id,
    key: snap.map.key,
    title: snap.map.title,
    mode: snap.map.mode,
    destination: snap.map.sections.destination,
    progress: `${count('decided')}/${snap.tickets.filter((t) => states.get(t.id) !== 'out-of-scope').length} decided`,
    counts: {
      decided: count('decided'),
      claimed: count('claimed'),
      ready: count('frontier'),
      blocked: count('blocked'),
      parked: count('parked'),
      outOfScope: count('out-of-scope'),
      ...(snap.map.verification || count('verifying') || count('rework') || count('held')
        ? { verifying: count('verifying'), rework: count('rework'), waitingOnHuman: count('held') }
        : {}),
    },
    ready: snap.tickets
      .filter((t) => states.get(t.id) === 'frontier')
      .map((t) => ({ key: t.key, title: t.title, type: t.type, attention: attention(t) })),
    claimed: snap.tickets
      .filter((t) => states.get(t.id) === 'claimed')
      .map((t) => ({ key: t.key, title: t.title, assignee: t.assignee })),
    blocked: snap.tickets.filter((t) => states.get(t.id) === 'blocked').map((t) => ({ key: t.key, title: t.title })),
    ...(snap.map.verification || count('verifying') || count('rework') || count('held')
      ? {
          verification: {
            level: snap.map.verification ?? 'off',
            verifying: snap.tickets.filter((t) => states.get(t.id) === 'verifying').map((t) => t.key),
            rework: snap.tickets.filter((t) => states.get(t.id) === 'rework').map((t) => t.key),
            waitingOnHuman: snap.tickets.filter((t) => states.get(t.id) === 'held').map((t) => t.key),
          },
        }
      : {}),
    runningSessions: mine
      .filter((d) => d.session.status === 'running')
      .map((d) => ({
        agent: d.session.agent,
        step: d.session.stepLabel,
        ticket: d.session.ticketId && keyOf(d.session.ticketId),
      })),
    waitingOnYou: docs.flatMap((d) => d.pending).filter((q) => q.mapId === snap.map.id).length,
    decisions: records
      .filter((d) => !d.supersededBy)
      .slice(-10)
      .map((d) => ({ id: d.id, ticket: d.ticketKey, summary: d.summary, ...posted(d) })),
    notYetSpecified: snap.map.sections.unspecified,
    spend: {
      inputTokens: sum(usage.map((u) => u.inputTokens)),
      outputTokens: sum(usage.map((u) => u.outputTokens)),
      costUsd: round(sum(usage.map((u) => u.costUsd))),
      sources: [...new Set(usage.map((u) => u.source ?? 'reported'))],
      note: 'Sessions of the last 24 hours',
    },
  };
}

/** How to work a ticket: with the human, as implementation, or as a decision the agent works out. */
function howTo(att: Attention, type: TicketType): string {
  if (att === 'hitl')
    return 'Needs the human: ask each question with ask_human (it waits for the answer), then close_ticket with the agreed resolution.';
  if (type === 'execute')
    return 'Implement the decided work, report_progress as you go, then close_ticket with what changed.';
  return 'Work it out yourself (read code, docs, run experiments), then close_ticket with the decision, rationale and alternatives.';
}
