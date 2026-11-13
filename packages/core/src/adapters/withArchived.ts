import type { MapDoc } from '../model/types';

/** `m` archived, or restored when `archived` is false. */
export function withArchived(m: MapDoc, archived: boolean): MapDoc {
  const next: MapDoc = { ...m };
  if (archived) next.archived = true;
  else delete next.archived;
  return next;
}
