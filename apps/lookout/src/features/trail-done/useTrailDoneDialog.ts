import type { MapSnapshot, TrailDone } from '@teamtrail/core';
import { useState } from 'react';
import { trailDoneSeen } from './trailDoneSeen';

/** The "destination reached" dialog: shown once per trail in this browser, until it's closed or followed. */
export function useTrailDoneDialog(snap: MapSnapshot | undefined, done: TrailDone | undefined) {
  const [, setClosed] = useState(0);
  const mapId = snap?.map.id;
  const reached = !!done && done.kind !== 'not-done';
  const show = reached && !!mapId && !snap?.map.archived && !trailDoneSeen.has(mapId);
  const close = () => {
    if (mapId) trailDoneSeen.add(mapId);
    setClosed((n) => n + 1);
  };
  return { show, close };
}
