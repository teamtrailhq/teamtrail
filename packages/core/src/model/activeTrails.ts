import type { MapSummary } from './types';

/** The trails work happens on: every listed trail but the archived ones (MapDoc.archived). */
export const activeTrails = <T extends Pick<MapSummary, 'archived'>>(maps: T[]) => maps.filter((m) => !m.archived);
