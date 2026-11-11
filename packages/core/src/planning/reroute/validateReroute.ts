import type { RerouteChange, RerouteError, RerouteProposal } from '../../model/reroute';
import { TICKET_TYPES, type DecisionRecord, type MapSnapshot, type Ticket } from '../../model/types';
import { cycleChanges } from './rerouteEdges';
import { settingShapeError } from './settingShape';

/** What validation needs from a proposal. */
export type RerouteDraft = Pick<
  RerouteProposal,
  'kind' | 'destinationReason' | 'reason' | 'evidence' | 'invalidates' | 'changes'
> &
  Partial<Pick<RerouteProposal, 'lane'>>;

/** What the changes are checked against. */
interface Scope {
  snap: MapSnapshot;
  decisions: DecisionRecord[];
  byId: Map<string, Ticket>;
  /** Refs of the tickets the proposal adds. */
  newRefs: Set<string>;
}

/**
 * Every problem with a proposal, each naming its change index: unknown refs, cycles, edits to done or cancelled
 * tickets (only `reopen` may touch those), duplicate refs and conflicting changes. Empty means it can be applied.
 */
export function validateReroute(snap: MapSnapshot, decisions: DecisionRecord[], draft: RerouteDraft): RerouteError[] {
  const scope: Scope = {
    snap,
    decisions,
    byId: new Map(snap.tickets.map((t) => [t.id, t])),
    newRefs: new Set(draft.changes.flatMap((c) => (c.op === 'add_ticket' ? [c.ref] : []))),
  };
  const errors = [
    ...proposalErrors(snap, draft),
    ...draft.changes.flatMap((c, i) => changeErrors(scope, c).map((message) => ({ change: i, message }))),
    ...duplicateErrors(scope, draft.changes),
    ...cycleChanges(snap.tickets, draft.changes).map((change) => ({
      // removed edges are taken out first, so only additions can close a cycle
      change,
      message: 'this blocking edge would create a cycle',
    })),
  ];
  return errors.sort((a, b) => (a.change ?? -1) - (b.change ?? -1));
}

function proposalErrors(snap: MapSnapshot, draft: RerouteDraft): RerouteError[] {
  const errors: string[] = [];
  if (!draft.reason.trim()) errors.push('"reason" is required');
  if (!draft.evidence.trim()) errors.push('"evidence" is required: what you found, with paths or output');
  if (!draft.changes.length) errors.push('a proposal needs at least one change');
  const shape = settingShapeError(draft);
  if (shape) errors.push(shape);
  const known = new Set((snap.map.sections.assumptions ?? []).map((a) => a.id));
  for (const id of draft.invalidates.filter((x) => !known.has(x))) errors.push(`unknown assumption ${id}`);
  if (draft.kind === 'challenge-destination') {
    if (!draft.destinationReason)
      errors.push('challenge-destination needs a reason: already-exists, wrong-problem or rescope');
    if (!draft.changes.some((c) => c.op === 'update_destination'))
      errors.push('challenge-destination needs an update_destination change with the suggested destination');
  }
  return errors.map((message) => ({ message }));
}

function changeErrors(s: Scope, c: RerouteChange): string[] {
  switch (c.op) {
    case 'add_ticket':
      return addTicketErrors(s, c);
    case 'cancel_ticket':
      return [...openTicketErrors(s, c.ticket), ...textErrors(c.reason, 'reason')];
    case 'edit_ticket':
      return [...openTicketErrors(s, c.ticket), ...(c.title?.trim() || c.body?.trim() ? [] : ['nothing to edit'])];
    case 'rewire':
      return rewireErrors(s, c);
    case 'supersede_decision':
      return [...decisionErrors(s, c.decision), ...textErrors(c.answer, 'answer')];
    case 'update_destination':
    case 'add_unspecified':
    case 'add_out_of_scope':
      return textErrors(c.text, 'text');
    case 'reopen':
      return [...reopenErrors(s, c.ticket), ...textErrors(c.reason, 'reason')];
    case 'skip_discovery':
      return [];
    case 'set_mode':
      return c.mode === s.snap.map.mode ? [`the trail is already ${c.mode}`] : [];
    default: {
      const unknown: never = c;
      return [`unknown change ${(unknown as { op?: string }).op}`];
    }
  }
}

const textErrors = (v: string | undefined, name: string) => (v?.trim() ? [] : [`"${name}" is required`]);

function addTicketErrors(s: Scope, c: Extract<RerouteChange, { op: 'add_ticket' }>): string[] {
  const errors = textErrors(c.title, 'title');
  if (!c.ref.trim()) errors.push('"ref" is required');
  if (s.byId.has(c.ref)) errors.push(`ref "${c.ref}" is already a ticket id`);
  if (!TICKET_TYPES.includes(c.type)) errors.push(`type ${c.type} cannot be planned`);
  if (c.type === 'execute' && s.snap.map.mode === 'plan-only')
    errors.push('execute tickets are disabled on plan-only trails');
  for (const b of c.blockedBy ?? []) errors.push(...blockerErrors(s, b));
  return errors;
}

function rewireErrors(s: Scope, c: Extract<RerouteChange, { op: 'rewire' }>): string[] {
  const add = c.addBlockedBy ?? [];
  const remove = c.removeBlockedBy ?? [];
  const errors = openTicketErrors(s, c.ticket);
  if (!add.length && !remove.length) errors.push('rewire needs "addBlockedBy" or "removeBlockedBy"');
  for (const b of add) errors.push(...blockerErrors(s, b));
  for (const b of remove) errors.push(...removalErrors(s, c.ticket, b));
  return errors;
}

/** A removed blocker must be one of the ticket's current blockers. */
function removalErrors(s: Scope, ticket: string, ref: string): string[] {
  const blocker = s.byId.get(ref);
  if (!blocker) return [`unknown ticket ${ref}`];
  const t = s.byId.get(ticket);
  if (!t || t.blockedBy.includes(ref)) return [];
  return [`${blocker.key} does not block ${t.key}`];
}

function blockerErrors(s: Scope, ref: string): string[] {
  if (s.newRefs.has(ref)) return [];
  const t = s.byId.get(ref);
  if (!t) return [`unknown ticket ${ref}`];
  return t.closeReason === 'not_planned' ? [`${t.key} is cancelled and cannot block anything`] : [];
}

/** cancel, edit and rewire need an existing open ticket. */
function openTicketErrors(s: Scope, ref: string): string[] {
  if (s.newRefs.has(ref)) return [`"${ref}" is added by this proposal: put the change in its add_ticket`];
  const t = s.byId.get(ref);
  if (!t) return [`unknown ticket ${ref}`];
  if (t.state === 'closed')
    return [`${t.key} is ${t.closeReason === 'not_planned' ? 'cancelled' : 'done'}: use reopen`];
  return [];
}

function reopenErrors(s: Scope, ref: string): string[] {
  const t = s.byId.get(ref);
  if (!t) return [`unknown ticket ${ref}`];
  return t.state === 'closed' ? [] : [`${t.key} is still open: only done or cancelled tickets can be reopened`];
}

function decisionErrors(s: Scope, id: string): string[] {
  const d = s.decisions.find((x) => x.id === id);
  if (!d) return [`unknown decision ${id}`];
  return d.supersededBy ? [`${d.id} is already superseded by ${d.supersededBy}`] : [];
}

/** Two add_tickets with one ref, one ticket changed twice in conflicting ways, or two destinations. */
function duplicateErrors(s: Scope, changes: RerouteChange[]): RerouteError[] {
  const errors: RerouteError[] = [];
  const refs = new Set<string>();
  const touched = new Map<string, string>();
  let destination = false;
  changes.forEach((c, change) => {
    if (c.op === 'add_ticket') {
      if (refs.has(c.ref)) errors.push({ change, message: `duplicate ref "${c.ref}"` });
      refs.add(c.ref);
    }
    if (c.op === 'update_destination') {
      if (destination) errors.push({ change, message: 'the destination is updated twice' });
      destination = true;
    }
    if (c.op !== 'cancel_ticket' && c.op !== 'reopen' && c.op !== 'edit_ticket') return;
    const prev = touched.get(c.ticket);
    if (prev) errors.push({ change, message: `${keyOf(s, c.ticket)} is already changed by ${prev}` });
    touched.set(c.ticket, c.op);
  });
  return errors;
}

const keyOf = (s: Scope, id: string) => s.byId.get(id)?.key ?? id;
