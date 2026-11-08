import type { ChecklistRecord } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { onTrackerChange } from '../../lib/trackerChanges';
import { getRoles } from './rolesApi';

/** A ticket's latest checklist answers; null when none were given, undefined while loading. */
export function useChecklist(mapId: string, ticketId: string) {
  const [rec, setRec] = useState<ChecklistRecord | null>();
  useEffect(() => {
    const path = `/roles/checklist?mapId=${encodeURIComponent(mapId)}&ticketId=${encodeURIComponent(ticketId)}`;
    const load = () =>
      getRoles<{ checklist: ChecklistRecord | null }>(path).then(
        (r) => setRec(r.checklist),
        () => setRec(null),
      );
    load();
    return onTrackerChange((p) => {
      if (p.endsWith('checklist.json')) load();
    });
  }, [mapId, ticketId]);
  return rec;
}
