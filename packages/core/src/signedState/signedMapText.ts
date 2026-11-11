import { parseMapFile } from '../adapters/markdown/mapFile';
import type { MapDoc } from '../model/types';
import { ASSUMPTION_PREFIX, destinationHash } from './stateFields';
import type { StateItem } from './stateItem';
import type { StateEntry } from './stateRecord';

/** The signed assumptions the file no longer has: a deleted line still counts, with its signed status. */
function missingAssumptions(map: MapDoc, signed: MapDoc, entry: StateEntry) {
  const have = new Set((map.sections.assumptions ?? []).map((a) => a.id));
  return (signed.sections.assumptions ?? []).filter((a) => !have.has(a.id) && `${ASSUMPTION_PREFIX}${a.id}` in entry.f);
}

/**
 * A trail with the parts of its text that count put back as they were signed: an assumption line deleted outside
 * Teamtrail, and a destination rewritten outside it (its hash is signed, `destination`), until the human accepts
 * the change. The text comes from the map as Teamtrail last wrote or the human accepted it (`entry.text`); without
 * that, nothing can be put back.
 */
export function withSignedMapText(item: Pick<StateItem, 'mapId'>, map: MapDoc, entry?: StateEntry): MapDoc {
  if (!entry?.text) return map;
  const signed = parseMapFile(item.mapId, entry.text);
  const missing = missingAssumptions(map, signed, entry);
  const rewritten = typeof entry.f.destination === 'string' && entry.f.destination !== destinationHash(map);
  const fits = destinationHash(signed) === entry.f.destination;
  if (!missing.length && !(rewritten && fits)) return map;
  const sections = { ...map.sections };
  if (missing.length) sections.assumptions = [...(map.sections.assumptions ?? []), ...missing];
  if (rewritten && fits) sections.destination = signed.sections.destination;
  return { ...map, sections };
}
