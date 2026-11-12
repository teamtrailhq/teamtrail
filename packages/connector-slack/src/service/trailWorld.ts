import type { AgentSessionDoc, MapSnapshot, TrackerAdapter } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/bridge';
import type { SlackContext } from './slackContext';

/** How many trails a question reads at most, as `status` lists. */
const MAX_TRAILS = 20;

export interface TrailWorld {
  adapter: TrackerAdapter;
  snaps: MapSnapshot[];
  docs: AgentSessionDoc[];
  now: number;
}

/** What Scout's read-only questions look at: the trails (up to 20), the agents' session docs and the time. */
export async function trailWorld(ctx: SlackContext): Promise<TrailWorld> {
  const adapter = await ctx.o.active();
  const maps = (await adapter.listMaps()).slice(0, MAX_TRAILS);
  const snaps = await Promise.all(maps.map((m) => adapter.loadMap(m.id)));
  const docs = await readAgentDocs(ctx.o.root);
  return { adapter, snaps, docs, now: ctx.o.now?.() ?? Date.now() };
}
