import type { ChecklistRecord } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { getGuides } from './guidesApi';

/** A ticket's latest checklist answers; null when none were given, undefined while loading. */
export function useChecklist(mapId: string, ticketId: string) {
  const [rec, setRec] = useState<ChecklistRecord | null>();
  const path = `/guides/checklist?mapId=${encodeURIComponent(mapId)}&ticketId=${encodeURIComponent(ticketId)}`;
  useLiveLoad({
    view: path,
    load: () => getGuides<{ checklist: ChecklistRecord | null }>(path),
    show: (r) => setRec(r.checklist),
    failed: () => setRec(null),
    changed: (p) => p.endsWith('checklist.json'),
  });
  return rec;
}
