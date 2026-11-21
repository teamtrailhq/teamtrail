import type { AttentionItem } from '@teamtrail/core';
import { ago } from '../../lib';
import type { LabelPart } from '../../lib/labelParts';
import { KIND_LABEL } from '../attention/attentionLabels';

/**
 * A waiting item's label line on the trail at a glance: what it is, the ticket's key, the agent that asks and how long
 * it has waited (`QUESTION · #6 · CLAUDE-02 · 14M`), the key left out when the title names it. "Blocking" leads, rose, when it holds work up.
 */
export function glanceWaitParts(input: {
  item: AttentionItem;
  keyOf: (ticketId: string) => string | undefined;
  now: number;
}): LabelPart[] {
  const { item } = input;
  const named = item.ticketId ? input.keyOf(item.ticketId) : undefined;
  // Say it once: the title often names the ticket already ("#6 needs a strongest model").
  const key = named && !item.title.includes(named) ? named : undefined;
  const parts: LabelPart[] = [];
  if (item.urgency === 'blocking') parts.push({ text: 'Blocking', tone: 'urgent' });
  parts.push(KIND_LABEL[item.kind]);
  if (key) parts.push(key);
  if (item.agent) parts.push(item.agent);
  parts.push(ago(input.now - item.since));
  return parts;
}
