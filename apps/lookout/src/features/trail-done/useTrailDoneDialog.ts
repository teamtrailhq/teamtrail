import type { MapSnapshot, TrailDone } from '@teamtrail/core';
import { useState } from 'react';
import { trailDoneSeen } from './trailDoneSeen';

/**
 * Which outcome the dialog announces: reached (the trail's id, as before), then once more when it is verified
 * together on main, or when a run on main fails with every merge (each failed run once).
 */
function stageOf(mapId: string, done: Exclude<TrailDone, { kind: 'not-done' }>) {
  if (done.kind === 'verified') return `${mapId}:verified`;
  if (done.together.kind === 'failed') return `${mapId}:failed:${done.together.runId}`;
  return mapId;
}

/** The "destination reached" dialog: shown once per trail and outcome in this browser, until closed or followed. */
export function useTrailDoneDialog(snap: MapSnapshot | undefined, done: TrailDone | undefined) {
  const [, setClosed] = useState(0);
  const mapId = snap?.map.id;
  const stage = mapId && done && done.kind !== 'not-done' ? stageOf(mapId, done) : undefined;
  const show = !!stage && !snap?.map.archived && !trailDoneSeen.has(stage);
  const close = () => {
    if (stage) trailDoneSeen.add(stage);
    setClosed((n) => n + 1);
  };
  return { show, close };
}
