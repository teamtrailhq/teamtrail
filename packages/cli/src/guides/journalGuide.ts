import { GUIDES_JOURNAL, type GuideAction } from '@teamtrail/core';
import { journalFile } from '@teamtrail/core/agents';

/** Records a guide change made from the CLI, as the trail lead, in the project's guide history. */
export function journalGuide(
  root: string,
  e: { action: GuideAction; guide: string; version?: string; check?: string },
) {
  journalFile(root).append({
    v: 1,
    kind: 'guide',
    at: Date.now(),
    actor: 'trail lead',
    actorKind: 'trail lead',
    mapId: GUIDES_JOURNAL,
    ...e,
  });
}
