import { parseMapFile } from '../adapters/markdown/mapFile';
import type { MapDoc } from '../model/types';
import { ASSUMPTION_PREFIX } from './stateFields';
import type { StateItem } from './stateItem';
import type { StateEntry } from './stateRecord';

/**
 * A trail with the assumptions it was signed with put back where its file no longer has them: an assumption line
 * deleted outside Teamtrail still counts (with its signed status) until the human accepts the deletion. The lines
 * come from the map as Teamtrail last wrote it (`entry.text`); without that, nothing can be put back.
 */
export function withSignedAssumptions(item: Pick<StateItem, 'mapId'>, map: MapDoc, entry?: StateEntry): MapDoc {
  if (!entry?.text) return map;
  const have = new Set((map.sections.assumptions ?? []).map((a) => a.id));
  const signed = parseMapFile(item.mapId, entry.text).sections.assumptions ?? [];
  const missing = signed.filter((a) => !have.has(a.id) && `${ASSUMPTION_PREFIX}${a.id}` in entry.f);
  if (!missing.length) return map;
  const assumptions = [...(map.sections.assumptions ?? []), ...missing];
  return { ...map, sections: { ...map.sections, assumptions } };
}
