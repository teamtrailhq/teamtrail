import type { SlackContext } from './slackContext';

/** In any ten minutes, how many questions one agent, and all agents together, may post as their own message. */
export const ASK_WINDOW_MS = 10 * 60_000;
export const ASKS_PER_AGENT = 3;
export const ASKS_IN_TOTAL = 10;

/**
 * Takes a place for one more message from `agent` (an agent's name, or `approvals:<trail>` for approval cards) as its
 * own Slack message, or says there is none left. An agent
 * that keeps asking can't fill the owner's DMs: past the limit its questions go to the trail's digest (one batched
 * message per window) and wait in the Lookout like any other. The total keeps many agents, or one agent under many
 * names, to the same.
 */
export function takeAskSlot(ctx: SlackContext, agent: string): boolean {
  const now = ctx.o.now?.() ?? Date.now();
  const recent = ctx.askLog.filter((a) => now - a.at < ASK_WINDOW_MS);
  ctx.askLog.splice(0, ctx.askLog.length, ...recent);
  const mine = recent.filter((a) => a.agent === agent).length;
  if (mine >= ASKS_PER_AGENT || recent.length >= ASKS_IN_TOTAL) return false;
  ctx.askLog.push({ agent, at: now });
  return true;
}
