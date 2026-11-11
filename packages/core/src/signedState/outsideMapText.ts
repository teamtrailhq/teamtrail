import { parseMapFile, serializeMapFile } from '../adapters/markdown/mapFile';
import { ASSUMPTION_PREFIX, destinationHash } from './stateFields';

/**
 * A trail's map as Teamtrail writes it while an outside change to its text waits for the human: the destination
 * rewritten and the assumption lines deleted outside Teamtrail stay as the file has them, unless this write itself
 * changes them (`changed`). Gates still read the signed version (signedMapText.ts), and the change stays pending, so
 * a write by Teamtrail never drops it before the human has seen it.
 */
export function keepOutsideMapText(input: { mapId: string; written: string; raw: string; changed: string[] }): string {
  const { mapId, changed } = input;
  const written = parseMapFile(mapId, input.written);
  const raw = parseMapFile(mapId, input.raw);
  const rewritten = !changed.includes('destination') && destinationHash(raw) !== destinationHash(written);
  const inRaw = new Set((raw.sections.assumptions ?? []).map((a) => a.id));
  const deleted = (id: string) => !inRaw.has(id) && !changed.includes(`${ASSUMPTION_PREFIX}${id}`);
  const assumptions = written.sections.assumptions ?? [];
  const kept = assumptions.filter((a) => !deleted(a.id));
  if (!rewritten && kept.length === assumptions.length) return input.written;
  const sections = { ...written.sections, assumptions: kept };
  if (rewritten) sections.destination = raw.sections.destination;
  return serializeMapFile({ ...written, sections });
}
