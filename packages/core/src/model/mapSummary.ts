import type { MapDoc, MapSummary } from './types';

/** A trail as lists show it: its id, key, title and whether it is archived. */
export const mapSummary = (m: MapDoc): MapSummary => ({
  id: m.id,
  key: m.key,
  title: m.title,
  ...(m.archived ? { archived: true as const } : {}),
});
