import type { DestinationReason, RerouteChange } from '@teamtrail/core';

/** Why the destination is challenged, in plain words. */
export const DESTINATION_WORDS: Record<DestinationReason, string> = {
  'already-exists': 'The work already exists',
  'wrong-problem': 'The trail targets the wrong problem',
  rescope: 'The trail should be rescoped',
};

/** One change in plain words: a short verb for the tag, the line itself, and an optional detail under it. */
export interface ChangeText {
  verb: string;
  text: string;
  detail?: string;
}

/** A labelled part of what a change writes, in full: what approving it puts in the trail word for word. */
export interface ChangePart {
  label: string;
  text: string;
}

/** The note a one-click dismiss sends the agent. */
export const DISMISS_NOTE = 'Dismissed by the trail lead. Carry on with the current plan.';

/** The note a one-click decline of a setting request sends the agent. */
export const DECLINE_NOTE = 'Declined by the trail lead.';

/**
 * Everything a change writes that its row only names: the new title and description of an edit, the description
 * and HITL mark of a new ticket, a superseding decision's words and how it will be recorded. Empty when the row
 * already says it all.
 */
export function changeParts(c: RerouteChange, by: string): ChangePart[] {
  switch (c.op) {
    case 'edit_ticket':
      return [
        ...(c.title?.trim() ? [{ label: 'New title', text: c.title.trim() }] : []),
        ...(c.body?.trim() ? [{ label: 'New description (replaces the old one)', text: c.body.trim() }] : []),
      ];
    case 'add_ticket':
      return [
        ...(c.body?.trim() ? [{ label: 'Description', text: c.body.trim() }] : []),
        { label: 'Who decides', text: c.hitl ? 'You (HITL)' : 'Agents, without you' },
      ];
    case 'supersede_decision':
      return [
        { label: `New answer to ${c.decision}`, text: c.answer },
        { label: 'Rationale', text: c.rationale },
        { label: 'Recorded as', text: `Proposed by ${by}, approved by you; the words stay ${by}'s.` },
      ];
    default:
      return [];
  }
}

/** Describes a change; `name` turns a ticket id or a new ticket's ref into what the trail lead sees (`#4`, a title). */
export function describeChange(c: RerouteChange, name: (idOrRef: string) => string): ChangeText {
  switch (c.op) {
    case 'add_ticket': {
      const after = c.blockedBy?.length ? `after ${c.blockedBy.map(name).join(', ')}` : undefined;
      return { verb: 'Add', text: c.title, detail: [`new ${c.type} ticket`, after].filter(Boolean).join(' · ') };
    }
    case 'cancel_ticket':
      return { verb: 'Cancel', text: name(c.ticket), detail: c.reason };
    case 'edit_ticket':
      return { verb: 'Revise', text: name(c.ticket), detail: reviseDetail(c) };
    case 'rewire':
      return { verb: 'Rewire', text: name(c.ticket), detail: rewireDetail(c, name) };
    case 'supersede_decision':
      return { verb: 'Supersede', text: c.decision, detail: 'Replaced by the answer below' };
    case 'update_destination':
      return { verb: 'Destination', text: c.text };
    case 'add_unspecified':
      return { verb: 'Not yet specified', text: c.text };
    case 'add_out_of_scope':
      return { verb: 'Out of scope', text: c.text };
    case 'reopen':
      return { verb: 'Reopen', text: name(c.ticket), detail: `Back in the queue: ${c.reason}` };
    case 'skip_discovery':
      return {
        verb: 'Skip discovery',
        text: 'Implementation stops waiting for a discovery brief',
        detail: 'The discovery ticket is ruled out',
      };
    case 'set_mode':
      return {
        verb: 'Mode',
        text: c.mode,
        detail: c.mode === 'plan-only' ? 'Execute tickets wait' : 'Execute tickets can be worked',
      };
    default: {
      const unknown: never = c;
      return unknown;
    }
  }
}

/** What an edit changes, named; its full text is in the change's parts. */
function reviseDetail(c: Extract<RerouteChange, { op: 'edit_ticket' }>) {
  const parts = [c.title?.trim() && 'New title', c.body?.trim() && 'new description'].filter(Boolean);
  return parts.join(' and ').replace(/^new/, 'New');
}

/** "now also after #3 · no longer after #2" */
function rewireDetail(c: Extract<RerouteChange, { op: 'rewire' }>, name: (idOrRef: string) => string) {
  const parts = [
    ...(c.addBlockedBy?.length ? [`now also after ${c.addBlockedBy.map(name).join(', ')}`] : []),
    ...(c.removeBlockedBy?.length ? [`no longer after ${c.removeBlockedBy.map(name).join(', ')}`] : []),
  ];
  return parts.join(' · ');
}
