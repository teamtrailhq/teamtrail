import { MarkdownAdapter, setTrailGuides } from '@teamtrail/core';
import { nodeMarkdownFs } from '@teamtrail/core/node';

/**
 * The trail lead turning a trail's guides off in Settings → Trail: no ticket type takes a guide, so completions need
 * no checklist. For tests about something else that chart a trail only to get to what they test.
 */
export async function guidesOff(root: string, mapId: string) {
  const adapter = new MarkdownAdapter({ ...nodeMarkdownFs(root), watch: undefined }, root);
  await setTrailGuides(adapter, mapId, {}, 'trail lead');
}
