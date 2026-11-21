import type { LabelPart, LabelTone } from '../../lib/labelParts';
import type { TicketChip } from '../inspector';
import type { BubbleNeed } from './needOf';

/** A chip's tone as a label part's: rose only for what needs you now, blaze for the agent, green for verified. */
const TONE: Record<NonNullable<TicketChip['tone']>, LabelTone> = {
  urgent: 'urgent',
  agent: 'agent',
  verified: 'ok',
  warn: 'plain',
};

/**
 * The bubble's bar, one label line: what it needs from you first (`QUESTION`, `READY TO MERGE`), then the ticket's
 * chips folded in (`#6 · EXECUTE · CLAUDE-02 · OPUS`). Under a need, a state chip that restates it (the red "needs
 * you" one, or the same words) is left out, so nothing is said twice.
 */
export function bubbleLabel(input: { need: BubbleNeed; chips: TicketChip[] }): LabelPart[] {
  const { need, chips } = input;
  const lead = needPart(need);
  const folded = chips
    .filter((c) => !(lead && c.kind === 'state' && restates(c, lead)))
    .map((c): LabelPart => ({ text: c.text, tone: c.tone ? TONE[c.tone] : 'plain', tip: c.tip }));
  return lead ? [lead, ...folded] : folded;
}

function needPart(need: BubbleNeed): LabelPart | undefined {
  if (need.kind === 'question') return { text: 'Question', tone: 'urgent' };
  if (need.kind === 'item') return { text: need.label, tone: need.urgent ? 'urgent' : 'plain' };
  return undefined;
}

function restates(chip: TicketChip, lead: LabelPart): boolean {
  const text = typeof lead === 'string' ? lead : lead.text;
  return chip.tone === 'urgent' || chip.text.toLowerCase() === text.toLowerCase();
}
