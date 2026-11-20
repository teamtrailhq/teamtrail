import {
  questionHeadline,
  type AttentionItem,
  type AttentionKind,
  type MapSnapshot,
  type PendingQuestion,
  type Ticket,
} from '@teamtrail/core';
import type { MetaPart } from '../../components/ui';
import { ago } from '../../lib';
import { detailReasons, KIND_LABEL } from '../attention';
import type { NeedText } from './types';

/** The one thing each kind asks, on the row's button; "Review" for the rest. */
const QUICK: Partial<Record<AttentionKind, string>> = {
  question: 'Answer',
  approval: 'Approve',
  criteria: 'Confirm criteria',
  'hitl-ready': 'Decide',
  stalled: 'Release',
  blocked: 'Unblock',
  merge: 'Merge',
  integration: 'Settle',
  'tracker-settings': 'Settle',
  'tracker-refused': 'Settle',
  delivery: 'Fix',
};

/**
 * The words on a row of Needs you: the kind (high risk for a question asked high risk), its title (a question's
 * headline: the full question is the open row's body) and its action.
 */
export function needText(item: AttentionItem, q?: PendingQuestion): NeedText {
  const chip = q?.lookoutOnly ? 'High risk' : KIND_LABEL[item.kind];
  return { chip, title: q ? questionHeadline(q).text : item.title.split('\n')[0], quick: QUICK[item.kind] ?? 'Review' };
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

/**
 * The list Needs you shows: the queue in its order, less each ticket's criteria on a trail whose brief waits, since
 * Approve the plan confirms them with the brief in one step (PlanNeedRow).
 */
export function needsShown(items: AttentionItem[]): AttentionItem[] {
  const planned = new Set(items.filter((i) => i.kind === 'brief').map((i) => i.mapId));
  return items.filter((i) => i.kind !== 'criteria' || !planned.has(i.mapId));
}

/**
 * Why an open ticket row ranks here, under its title: the ticket only when the title doesn't already name it (say it
 * once), then the item's reasons.
 */
export function needWhy(item: AttentionItem, t: Pick<Ticket, 'key' | 'title'>): MetaPart[] {
  const named = item.title.includes(t.key);
  return [...(named ? [] : [`${t.key} ${t.title}`]), ...detailReasons(item)];
}
