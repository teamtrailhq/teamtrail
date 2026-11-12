import { readAgentDocs } from '@teamtrail/core/bridge';
import { askMessage, label } from '../blocks';
import { briefTrail, trailListBlocks, statusBlocks } from '../status';
import { askView } from './asks';
import { findTrail } from './findTrail';
import type { SlackContext } from './slackContext';

/** `/scout inbox`: a reply only its reader sees, so no answer buttons (Slack drops clicks on those); open each. */
export async function inboxMessage(ctx: SlackContext) {
  const docs = await readAgentDocs(ctx.o.root);
  const pending = docs.flatMap((d) => d.pending);
  if (!pending.length) return { text: 'Nothing is waiting on you.' };
  const adapter = await ctx.o.active();
  const url = ctx.o.url();
  const blocks = (
    await Promise.all(
      pending.slice(0, 10).map(async (q) => askMessage(await askView(ctx, q, adapter), { url, mode: 'read' }).blocks),
    )
  ).flat();
  return { text: `${pending.length} waiting on you`, blocks };
}

/**
 * `/scout status [trail]`: one trail's report, or all trails. A name no trail has answers so, unless `fallback`
 * (a mention or DM, written as a sentence), which lists all trails under a note instead.
 */
export async function statusMessage(ctx: SlackContext, arg: string, command: string, o: { fallback?: boolean } = {}) {
  const adapter = await ctx.o.active();
  const maps = await adapter.listMaps();
  const docs = await readAgentDocs(ctx.o.root);
  const now = Date.now();
  const m = arg ? findTrail(maps, arg) : undefined;
  if (m) return statusBlocks(briefTrail(await adapter.loadMap(m.id), docs), { now, url: ctx.o.url() });
  if (arg && !o.fallback) return { text: `No trail matches “${label(arg)}”.` };
  const briefs = await Promise.all(maps.slice(0, 20).map(async (m) => briefTrail(await adapter.loadMap(m.id), docs)));
  const list = trailListBlocks(briefs, command);
  if (!arg) return list;
  // No trail by that name: all of them, saying so, rather than nothing.
  const missed = {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `No trail matches “${label(arg)}”. All trails:` }],
  };
  return { ...list, blocks: [missed, ...list.blocks] };
}
