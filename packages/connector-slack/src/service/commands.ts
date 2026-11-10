import { readAgentDocs } from '@teamtrail/core/bridge';
import { askMessage, label } from '../blocks';
import { briefTrail, trailListBlocks, statusBlocks } from '../status';
import { askView } from './asks';
import type { SlackContext } from './slackContext';

export async function inboxMessage(ctx: SlackContext) {
  const docs = await readAgentDocs(ctx.o.root);
  const pending = docs.flatMap((d) => d.pending);
  if (!pending.length) return { text: 'Nothing is waiting on you.' };
  const adapter = await ctx.o.active();
  const url = ctx.o.url();
  const blocks = (
    await Promise.all(pending.slice(0, 10).map(async (q) => askMessage(await askView(ctx, q, adapter), { url }).blocks))
  ).flat();
  return { text: `${pending.length} waiting on you`, blocks };
}

export async function statusMessage(ctx: SlackContext, arg: string, command: string) {
  const adapter = await ctx.o.active();
  const maps = await adapter.listMaps();
  const docs = await readAgentDocs(ctx.o.root);
  const now = Date.now();
  if (arg) {
    const a = arg.toLowerCase().replace(/^#/, '');
    const m =
      maps.find((x) => x.key.toLowerCase().replace(/^#/, '') === a || x.id === arg) ??
      maps.find((x) => x.title.toLowerCase().includes(a));
    if (!m) return { text: `No trail matches “${label(arg)}”.` };
    return statusBlocks(briefTrail(await adapter.loadMap(m.id), docs), { now, url: ctx.o.url() });
  }
  const briefs = await Promise.all(maps.slice(0, 20).map(async (m) => briefTrail(await adapter.loadMap(m.id), docs)));
  return trailListBlocks(briefs, command);
}
