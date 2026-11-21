import {
  questionHeadline,
  type AttentionItem,
  type AttentionKind,
  type MapSnapshot,
  type PendingQuestion,
  type Ticket,
  oneLine,
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
 * The row's label line after its kind: the trail when it isn't the one on screen, the ticket (unless the title names
 * it), who asks, and how long it has waited.
 */
export function needLabel(input: { item: AttentionItem; snap?: MapSnapshot; current?: string; now: number }): string[] {
  const { item, snap } = input;
  const ticket = snap?.tickets.find((t) => t.id === item.ticketId);
  const parts: string[] = [];
  if (item.mapId && item.mapId !== input.current) parts.push(snap?.map.title ?? item.mapId);
  if (ticket && !item.title.includes(ticket.key)) parts.push(ticket.key);
  if (item.kind === 'question' && item.agent) parts.push(item.agent);
  parts.push(ago(input.now - item.since));
  return parts;
}

/**
 * One line under the title, cut to fit: the rest of a question when its headline doesn't say it all, else why the
 * item ranks here; nothing when there is nothing more to say.
 */
export function needDetail(item: AttentionItem, q?: PendingQuestion): string | undefined {
  if (q) return questionHeadline(q).whole ? undefined : oneLine(q.text);
  const reasons = detailReasons(item);
  return reasons.length ? reasons.join(' · ') : undefined;
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
