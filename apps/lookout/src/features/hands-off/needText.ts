import type { AttentionItem, AttentionKind, MapSnapshot, PendingQuestion } from '@teamtrail/core';
import type { MetaPart } from '../../components/ui';
import { ago } from '../../lib';
import { KIND_LABEL } from '../attention';
import type { NeedText } from './types';

/** The one thing each kind asks, on the row's button; "Review" for the rest. */
const QUICK: Partial<Record<AttentionKind, string>> = {
  question: 'Answer',
  approval: 'Approve',
  'hitl-ready': 'Decide',
  stalled: 'Release',
  blocked: 'Unblock',
  merge: 'Merge',
  integration: 'Settle',
  'tracker-settings': 'Settle',
  delivery: 'Fix',
};

/** The words on a row of Needs you: the kind (high risk for a question asked high risk), its title and its action. */
export function needText(item: AttentionItem, q?: PendingQuestion): NeedText {
  const chip = q?.lookoutOnly ? 'High risk' : KIND_LABEL[item.kind];
  return { chip, title: q?.text ?? item.title.split('\n')[0], quick: QUICK[item.kind] ?? 'Review' };
}

/**
 * The dim context after the title: the trail when it isn't the one on screen, the ticket (unless the title names
 * it), who asks, and how long it has waited.
 */
export function needMeta(input: { item: AttentionItem; snap?: MapSnapshot; current?: string; now: number }) {
  const { item, snap } = input;
  const ticket = snap?.tickets.find((t) => t.id === item.ticketId);
  const parts: MetaPart[] = [];
  if (item.mapId && item.mapId !== input.current) parts.push(snap?.map.title ?? item.mapId);
  if (ticket && !item.title.includes(ticket.key)) parts.push({ text: ticket.key, code: true });
  if (item.kind === 'question' && item.agent) parts.push(item.agent);
  parts.push(ago(input.now - item.since));
  return parts;
}
