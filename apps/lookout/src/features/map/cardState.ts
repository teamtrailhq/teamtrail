import type { LaidOutNode, ModelTier } from '@teamtrail/core';
import { ago, shortModel, TYPE_TEXT } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';
import { waitsOnText } from '../../lib/waitsOnText';
import { cardNeedText } from '../attention/needLabel';
import type { SignGuide } from '../guides/types';
import { CARD_LABEL_ROOM } from './cardLayout';
import { type CardLabelPart, type CardLabelTone, fitLabel } from './fitLabel';
import { statePart } from './statePart';

/** statePart's tones, as a label part's. */
const TONE: Record<string, CardLabelTone> = {
  urgent: 'urgent',
  agent: 'agent',
  warn: 'warn',
  wait: 'wait',
  waits: 'dim',
  verified: 'ok',
};

/**
 * A card's label line, fitted to the card: TYPE · #n · its state in words (statePart), then a guide added to it,
 * "needs you" and its pull request. Richest first: the agent's model and the PR (`PR #12 merged`), then either,
 * then the PR without its number, then neither; at each, the type steps aside before the next is tried, and only
 * then is the last part cut short. The type also steps
 * aside when the state says enough (ready for an agent, what it waits on). `reserve` keeps room on the right for a
 * reroute tag or the ❄.
 */
export function cardState(input: {
  n: LaidOutNode;
  live?: LiveTicket;
  now: number;
  marked: boolean;
  waiting: boolean;
  stalled?: boolean;
  brief: boolean;
  wait?: ModelTier;
  verified?: boolean;
  guide?: SignGuide;
  needsYou: boolean;
  /** The ticket's pull request, e.g. `PR #12 merged`. */
  pr?: string;
  /** Room kept on the right for a reroute tag or the ❄. */
  reserve: number;
}): { parts: CardLabelPart[]; tone?: string } {
  const { n, live, marked } = input;
  const t = n.ticket;
  const g = input.guide;
  const need = live?.items[0];
  const since = n.state === 'frontier' ? live?.readySince : undefined;
  const readyFor = since === undefined ? undefined : ago(Math.max(0, input.now - since));
  const waitsOn = live && waitsOnText(live.waitsOn, live.waitsOnYours);
  const part = (model?: string) =>
    marked
      ? undefined
      : statePart({
          n,
          session: live?.session,
          waiting: input.waiting,
          need: need && cardNeedText(need),
          stalled: input.stalled,
          brief: input.brief,
          wait: input.wait,
          model,
          readyFor,
          waitsOn,
          verified: input.verified,
        });
  const build = (o: { model?: string; pr?: string; type: boolean }) => {
    const state = part(o.model);
    const typed = o.type && state?.tone !== 'wait' && state?.tone !== 'waits';
    const parts: CardLabelPart[] = [
      ...(typed ? [{ text: TYPE_TEXT[t.type], tone: 'plain' as const }] : []),
      { text: t.key, tone: 'plain' },
      ...(state?.text ? [{ text: state.text, tone: TONE[state.tone] ?? 'plain' }] : []),
      ...(g ? [{ text: g.name, tone: 'plain' as const, guide: { id: g.id, tip: g.tip, off: g.off } }] : []),
      ...(input.needsYou && !need ? [{ text: 'needs you', tone: 'urgent' as const }] : []),
      ...(o.pr ? [{ text: o.pr, tone: 'plain' as const }] : []),
    ];
    return parts;
  };
  const model = shortModel(live?.session?.model);
  const short = input.pr?.replace(/ #\d+/, '');
  const options = [...(model ? [{ model, pr: input.pr }, { model }] : []), { pr: input.pr }, { pr: short }, {}];
  const candidates = options.flatMap((o) => [build({ ...o, type: true }), build({ ...o, type: false })]);
  const tone = part(model)?.tone;
  return { parts: fitLabel(candidates, CARD_LABEL_ROOM - input.reserve), tone };
}
