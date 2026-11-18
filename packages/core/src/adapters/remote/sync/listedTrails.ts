import type { MapDoc, MapSummary } from '../../../model/types';

const view = (m: MapSummary) => `${m.id}\n${m.title}\n${m.archived ? 1 : 0}`;

/** Whether two trail lists differ in anything a list shows: which trails, their titles, whether archived. */
export function listsDiffer(a: MapSummary[] | undefined, b: MapSummary[]) {
  if (!a) return false;
  const seen = new Set(a.map(view));
  return a.length !== b.length || b.some((m) => !seen.has(view(m)));
}

/**
 * The listed summary of a trail as just read: a title or archived label changed in the tracker shows in the trail
 * list at once, not only at the next full listing. Returns whether the list changed.
 */
export function patchListed(list: MapSummary[] | undefined, map: MapDoc): boolean {
  const listed = list?.find((m) => m.id === map.id);
  if (!listed || (listed.title === map.title && !!listed.archived === !!map.archived)) return false;
  listed.title = map.title;
  if (map.archived) listed.archived = true;
  else delete listed.archived;
  return true;
}
