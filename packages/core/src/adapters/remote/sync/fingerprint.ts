import { parseMapBody, serializeMapBody } from '../../../model/mapBody';
import type { MapSections } from '../../../model/types';
import type { CacheEntry } from './types';

/** Map sections exactly as they read back from the tracker, so cache and remote compare equal. */
export const roundtrip = (s: MapSections) => parseMapBody(serializeMapBody(s));

/** Everything about a trail the tracker can change; equal fingerprints mean nothing to resync. */
export function fingerprint(e: CacheEntry) {
  const { map, tickets } = e.snap;
  return JSON.stringify([
    map.title,
    map.mode,
    map.verification ?? '',
    map.guides ?? [],
    roundtrip(map.sections),
    [...tickets]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((t) => [
        t.id,
        t.title,
        t.type,
        !!t.hitl,
        t.state,
        t.closeReason ?? '',
        t.assignee ?? '',
        t.status ?? '',
        t.verification ?? '',
        t.checks ?? null,
        t.guide ?? '',
        [...t.blockedBy].sort(),
        t.body.trim(),
        t.comments.map((c) => [c.author, c.body.trim()]),
      ]),
    e.decisions.map((d) => `${d.id}>${d.supersededBy ?? ''}`).sort(),
  ]);
}
