import type { AttentionItem, AttentionKind, MapSnapshot } from '@teamtrail/core';
import type { EdgeTone, MetaPart } from '../../components/ui';
import { ago } from '../../lib';
import type { LabelPart } from '../../lib/labelParts';
import { KIND_LABEL } from './attentionLabels';

/** Kinds where work is held up or at risk: an amber edge unless the item needs you now (red). */
const AT_RISK: AttentionKind[] = ['blocked', 'flag', 'stalled', 'policy', 'reroute', 'overlap', 'integration', 'model'];

/** Red when it needs you now (interrupting or blocking), amber when work is held up or at risk, neutral otherwise. */
export function edgeFor(item: AttentionItem, interrupting: boolean): EdgeTone {
  if (interrupting || item.urgency === 'blocking') return 'urgent';
  if (AT_RISK.includes(item.kind)) return 'attention';
  return 'neutral';
}

/**
 * Reasons the row doesn't already say. Urgency shows as the edge and "Blocking", the wait as the time, and batching
 * as the group heading, so those reasons are dropped here (agents still get them all over MCP).
 */
const SAID_ELSEWHERE = [/^marked blocking$/, /^fyi\b/, /^soon\b/, /^waiting \d/, /^answer together/, /questions from /];

export function detailReasons(item: AttentionItem): string[] {
  return item.reasons.filter((r) => !SAID_ELSEWHERE.some((re) => re.test(r)));
}

/** Context: Blocking · kind (or the asking agent) · ticket, if the title doesn't name it · trail, if not this one. */
export function contextParts(input: { item: AttentionItem; snap?: MapSnapshot; otherTrail: boolean }): MetaPart[] {
  const { item, snap } = input;
  const ticket = snap?.tickets.find((t) => t.id === item.ticketId);
  const kind = item.kind === 'question' && item.agent ? `${item.agent} asks` : KIND_LABEL[item.kind];
  const parts: MetaPart[] = [];
  if (item.urgency === 'blocking') parts.push({ text: 'Blocking', urgent: true, className: 'urgency-tag' });
  parts.push({ text: kind, strong: true });
  const ticketText = ticket && ticketPart(item.title, ticket);
  if (ticketText) parts.push(ticketText);
  if (input.otherTrail) parts.push(snap?.map.title ?? item.mapId);
  return parts;
}

/** Say it once: nothing when the title names the ticket key, the key when it repeats the ticket's title. */
function ticketPart(title: string, ticket: { key: string; title: string }): MetaPart | undefined {
  if (title.includes(ticket.key)) return undefined;
  if (title.includes(ticket.title)) return { text: ticket.key, code: true };
  return `${ticket.key} ${ticket.title}`;
}

/**
 * A queue row's label line, the scenes' way: Blocking (rose: it needs you now), the kind or who asks, the ticket
 * unless the title names it, the trail when it isn't this one, and how long it has waited.
 */
export function itemLabel(input: { item: AttentionItem; snap?: MapSnapshot; otherTrail: boolean; now: number }) {
  const { item, snap } = input;
  const ticket = snap?.tickets.find((t) => t.id === item.ticketId);
  const parts: LabelPart[] = [];
  if (item.urgency === 'blocking') parts.push({ text: 'Blocking', tone: 'urgent', className: 'urgency-tag' });
  parts.push(item.kind === 'question' && item.agent ? `${item.agent} asks` : KIND_LABEL[item.kind]);
  if (ticket && !item.title.includes(ticket.key)) parts.push(ticket.key);
  if (input.otherTrail) parts.push(snap?.map.title ?? item.mapId);
  parts.push(ago(input.now - item.since));
  return parts;
}
