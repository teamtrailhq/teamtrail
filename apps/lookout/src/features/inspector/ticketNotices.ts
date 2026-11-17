import type { AttentionKind } from '@teamtrail/core';
import type { LoadedTicket } from './types';

/** Queue items the state line already says in its own words. */
const IN_STANDING = new Set<AttentionKind>(['question', 'approval', 'blocked', 'hitl-ready', 'stalled', 'model']);

/**
 * What else holds the ticket up or puts it at risk, one line each under the state line: its pull request's flags,
 * the queue's other items on it (a policy call, an overlap, a precedent…), and a text edit made outside Teamtrail,
 * which is only noted (`risk: false`).
 */
export function ticketNotices(v: LoadedTicket): { text: string; risk: boolean }[] {
  const flags = v.pr?.flags.map((f) => ({ text: f.text, risk: true })) ?? [];
  const items = v.items.filter((i) => !IN_STANDING.has(i.kind)).map((i) => ({ text: i.title, risk: true }));
  const edited = v.textEdited && !v.change ? [{ text: 'Text edited outside Teamtrail', risk: false }] : [];
  return [...flags, ...items, ...edited];
}
