import type { TrackerAdapter } from '../../adapters/adapter';
import type { Journal } from '../../model/lifecycle';
import type { RerouteChange, RerouteProposal } from '../../model/reroute';
import type { MapSnapshot } from '../../model/types';
import { transition } from '../lifecycle/transition';
import { oneLine } from '../../model/safeText';
import { supersedeDecision } from '../operations/decisionOps';
import { ruleOutOfScope } from '../operations/scope';

/** Who applies a proposal: the trail lead who approved it, journaled like their other actions. */
export interface ApplyEnv {
  adapter: TrackerAdapter;
  /** Actor id of the approver. */
  actor: string;
  journal?: Journal;
  /** Persists the proposal after every step, so an interrupted apply resumes where it stopped. */
  save(p: RerouteProposal): void | Promise<void>;
}

/** One change, with the proposal it belongs to and the ids of the tickets the proposal created. */
export interface Step {
  env: ApplyEnv;
  p: RerouteProposal;
  index: number;
  /** Resolves a ticket id or a new ref to a real ticket id. */
  idOf: (ref: string) => string;
}

/** The line each ticket or comment a proposal writes ends with; finding it again makes every step idempotent. */
export const rerouteMark = (p: Pick<RerouteProposal, 'id'>, index: number) => `reroute ${p.id} (change ${index + 1})`;

/** Applies a change's effect other than creating tickets (done before, by the caller). Safe to run twice. */
export async function applyChange(s: Step, c: RerouteChange): Promise<void> {
  const { env, p } = s;
  const mapId = p.mapId;
  const snap = await env.adapter.loadMap(mapId);
  switch (c.op) {
    case 'add_ticket':
      return wire(s, s.idOf(c.ref), c.blockedBy ?? []);
    case 'rewire':
      await unwire(s, c.ticket, c.removeBlockedBy ?? []);
      return wire(s, c.ticket, c.addBlockedBy ?? []);
    case 'cancel_ticket':
      return cancel(s, snap, c);
    case 'edit_ticket':
      return revise(s, snap, c);
    case 'supersede_decision':
      return supersede(s, c);
    case 'update_destination':
      return env.adapter.updateMapSections(mapId, { destination: c.text.trim() });
    case 'add_unspecified':
      return appendLine(s, snap, { key: 'unspecified', text: c.text });
    case 'add_out_of_scope':
      return appendLine(s, snap, { key: 'outOfScope', text: c.text });
    case 'reopen':
      return reopen(s, snap, c);
    default: {
      const unknown: never = c;
      throw new Error(`unknown change ${(unknown as { op?: string }).op}`);
    }
  }
}

async function wire(s: Step, ticketId: string, blockers: string[]) {
  for (const b of blockers) await s.env.adapter.addBlocking(s.p.mapId, s.idOf(b), ticketId);
}

async function unwire(s: Step, ticketId: string, blockers: string[]) {
  for (const b of blockers) await s.env.adapter.removeBlocking(s.p.mapId, b, ticketId);
}

async function cancel(s: Step, snap: MapSnapshot, c: Extract<RerouteChange, { op: 'cancel_ticket' }>) {
  const t = snap.tickets.find((x) => x.id === c.ticket);
  if (!t || t.state === 'closed') return;
  await ruleOutOfScope(
    s.env.adapter,
    s.p.mapId,
    { ticketId: t.id },
    {
      reason: `${c.reason} (${rerouteMark(s.p, s.index)})`,
      author: s.env.actor,
      actorKind: 'trail lead',
      journal: s.env.journal,
      source: { kind: 'lookout', label: `reroute ${s.p.id}`, ref: `${s.p.mapId}/${s.p.id}/${s.index}` },
    },
  );
}

/** Rewrites the ticket's title and body, then leaves a one-line audit comment. Each step is skipped once done. */
async function revise(s: Step, snap: MapSnapshot, c: Extract<RerouteChange, { op: 'edit_ticket' }>) {
  const t = snap.tickets.find((x) => x.id === c.ticket);
  if (!t) return;
  const edit = {
    ...(c.title?.trim() ? { title: c.title.trim() } : {}),
    ...(c.body?.trim() ? { body: c.body.trim() } : {}),
  };
  const changed =
    (edit.title !== undefined && edit.title !== t.title) || (edit.body !== undefined && edit.body !== t.body);
  if (changed) await s.env.adapter.editTicket(s.p.mapId, t.id, edit);
  const mark = rerouteMark(s.p, s.index);
  if (t.comments.some((x) => x.body.includes(mark))) return;
  await s.env.adapter.comment(s.p.mapId, t.id, s.env.actor, `Edited by ${mark}, approved by ${s.env.actor}.`);
}

/** Puts a done or cancelled ticket back in the queue through the trail lead's `reopen` transition. */
async function reopen(s: Step, snap: MapSnapshot, c: Extract<RerouteChange, { op: 'reopen' }>) {
  const t = snap.tickets.find((x) => x.id === c.ticket);
  // a proposal applied before reopen existed made a follow-up ticket instead; leave that as it is
  if (!t || t.state === 'open' || s.p.created[s.index]) return;
  await transition(s.env.adapter, s.p.mapId, t.id, {
    event: 'reopen',
    actor: s.env.actor,
    actorKind: 'trail lead',
    reason: `${c.reason} (${rerouteMark(s.p, s.index)})`,
    journal: s.env.journal,
  });
}

async function supersede(s: Step, c: Extract<RerouteChange, { op: 'supersede_decision' }>) {
  const old = (await s.env.adapter.listDecisions(s.p.mapId)).find((d) => d.id === c.decision);
  if (!old || old.supersededBy) return;
  // The words are the agent's; the trail lead's part is approving them. The record says both, apart.
  await supersedeDecision(s.env.adapter, s.p.mapId, old.id, {
    answer: c.answer,
    summary: `${oneLine(c.answer).slice(0, 100)} (proposed by ${s.p.by}, approved by ${s.env.actor})`,
    rationale: [
      `Proposed by ${s.p.by} in reroute ${s.p.id}; approved by ${s.env.actor}. The answer and rationale are ${s.p.by}'s words.`,
      `${s.p.by}'s rationale: ${c.rationale}`,
    ].join('\n\n'),
    decidedBy: s.env.actor,
    participants: [{ id: s.p.by }, { id: s.env.actor }],
    source: {
      kind: 'lookout',
      label: `reroute ${s.p.id} by ${s.p.by}, approved by ${s.env.actor}`,
      ref: `${s.p.mapId}/${s.p.id}/${s.index}`,
    },
  });
}

async function appendLine(s: Step, snap: MapSnapshot, line: { key: 'unspecified' | 'outOfScope'; text: string }) {
  const current = snap.map.sections[line.key];
  const text = line.text.trim();
  if (current.includes(text)) return;
  await s.env.adapter.updateMapSections(s.p.mapId, { [line.key]: [...current, text] });
}
