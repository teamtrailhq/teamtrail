import type { MapDoc } from '@teamtrail/core';

/** What New trail starts with when a trail is started over: its title, destination, notes and open assumptions. */
export interface TrailSeed {
  title: string;
  destination: string;
  notes: string;
  assumptions: string[];
}

export const trailSeed = (m: MapDoc): TrailSeed => ({
  title: m.title,
  destination: m.sections.destination,
  notes: m.sections.notes,
  assumptions: (m.sections.assumptions ?? []).filter((a) => a.status !== 'invalidated').map((a) => a.text),
});
