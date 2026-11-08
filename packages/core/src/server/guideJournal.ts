import { readGuidesConfig } from '../guides/guidesConfig';
import { listGuides } from '../guides/guideStore';
import { journalFile } from '../history/journalFile';
import { GUIDES_JOURNAL, type GuideAction } from '../model/lifecycle';

export const TRAIL_LEAD = 'trail lead';

/** Everything Settings → Guides shows: the guides with their status, and the catalogs. */
export const guidesView = (root: string) => {
  const { config, errors } = readGuidesConfig(root);
  return { guides: listGuides(root), registries: config.registries, configErrors: errors };
};

/** Records a trail lead's guide change in the trail's history, or the project's for install and approval. */
export function journalGuide(
  root: string,
  e: { action: GuideAction; guide: string; mapId?: string; version?: string; ticketId?: string; check?: string },
) {
  journalFile(root).append({
    v: 1,
    kind: 'guide',
    at: Date.now(),
    actor: TRAIL_LEAD,
    actorKind: 'trail lead',
    ...e,
    mapId: e.mapId ?? GUIDES_JOURNAL,
  });
}
