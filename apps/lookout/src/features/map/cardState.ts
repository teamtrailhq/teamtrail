import type { LaidOutNode, ModelTier } from '@teamtrail/core';
import { ago, shortModel, TYPE_TEXT } from '../../lib';
import type { LiveTicket } from '../../lib/liveTickets';
import { waitsOnText } from '../../lib/waitsOnText';
import { cardNeedText } from '../attention/needLabel';
import { type CardChip, layoutChips } from './layoutChips';
import { statePart } from './statePart';

/**
 * A card's meta row, laid out: its state in words (statePart) and the chips. The agent's model goes on the agent's
 * chip when the row has room for it without squeezing; else the agent's name alone. The type steps aside when the
 * state already says enough (waiting for an agent, what it waits on). The pull request (`PR #12 merged`, else
 * `PR merged`) gets a chip only when the row has room for it without squeezing.
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
  guide?: string;
  needsYou: boolean;
  /** The ticket's pull request, e.g. `PR #12 merged`. */
  pr?: string;
  /** Room kept on the right for a reroute tag or the ❄. */
  reserve: number;
}): { chips: CardChip[]; tone?: string } {
  const { n, live, marked } = input;
  const t = n.ticket;
  const need = live?.items[0];
  // rework says so itself; a ready ticket says how long it has waited for an agent
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
          step: !input.guide,
          model,
          readyFor,
          waitsOn,
          verified: input.verified,
        });
  const lay = (model?: string, pr?: string) => {
    let scale = 1;
    const state = part(model);
    const chips = layoutChips({
      key: t.key,
      type: state?.tone === 'wait' || state?.tone === 'waits' ? undefined : TYPE_TEXT[t.type],
      guide: input.guide,
      state: state?.text,
      needsYou: input.needsYou && !need,
      pr,
      reserve: input.reserve,
      onScale: (s) => (scale = s),
    });
    return { chips, tone: state?.tone, scale };
  };
  const model = shortModel(live?.session?.model);
  // richest first: the model and the pull request, then either (the PR without its number when that fits), then
  // neither (squeezed if it must be)
  const short = input.pr?.replace(/ #\d+/, '');
  const options = [...(model ? [{ model, pr: input.pr }, { model }] : []), { pr: input.pr }, { pr: short }];
  for (const o of options) {
    const laid = lay(o.model, o.pr);
    if (laid.scale >= 1) return laid;
  }
  return lay();
}
