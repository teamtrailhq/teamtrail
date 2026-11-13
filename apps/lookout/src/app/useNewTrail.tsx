import type { MapDoc } from '@teamtrail/core';
import { useState } from 'react';
import { trailSeed, type TrailSeed } from '../features/trail';
import type { LookoutApi } from '../hooks';
import type { Runtime } from '../lib';
import { AppNewTrail } from './AppNewTrail';

/** The New trail dialog: opened empty, or by Start over with the archived trail's idea filled in. */
export function useNewTrail(rt: Runtime, api: LookoutApi) {
  const [open, setOpen] = useState<boolean | TrailSeed>(false);
  const startOver = (map: MapDoc) => void api.actions.setArchived(true).then(() => setOpen(trailSeed(map)));
  const dialog = open && (
    <AppNewTrail
      rt={rt}
      seed={typeof open === 'object' ? open : undefined}
      onClose={() => setOpen(false)}
      onCreated={(id) => api.actions.selectMap(id)}
    />
  );
  return { open: () => setOpen(true), startOver, dialog };
}
