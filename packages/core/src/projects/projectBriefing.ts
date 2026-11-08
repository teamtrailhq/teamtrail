import { ActivityStream } from '../activity/activityStream';
import type { TrackerAdapter } from '../adapters/adapter';
import { readAgentDocs } from '../agents/agentDocs';
import type { AttentionItem } from '../model/attention';
import { buildBriefing, type Briefing } from '../planning/briefing';

/**
 * The away briefing of one project, built by the same `buildBriefing` the Lookout uses, from its files:
 * the trails, decisions and agent sessions since `since`.
 */
export async function projectBriefing(input: {
  root: string;
  adapter: TrackerAdapter;
  since: number;
  attention?: AttentionItem[];
  now?: number;
}): Promise<Briefing> {
  const { adapter } = input;
  const maps = await adapter.listMaps();
  const snaps = await Promise.all(maps.map((m) => adapter.loadMap(m.id)));
  const decisions = (await Promise.all(maps.map((m) => adapter.listDecisions(m.id)))).flat();
  const activity = new ActivityStream();
  for (const doc of [...(await readAgentDocs(input.root))].reverse()) activity.syncRemote(doc);
  return buildBriefing({
    snaps,
    decisions,
    activity: activity.snapshot,
    since: () => input.since,
    now: input.now,
    attention: input.attention,
  });
}
