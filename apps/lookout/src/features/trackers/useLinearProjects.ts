import type { LinearProjectList } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { trackerApi } from './trackerApi';

/** The projects of the picked Linear team; undefined while loading or with no team picked. */
export function useLinearProjects(o: { teamId: string; apiKey?: string; enabled: boolean }) {
  const [list, setList] = useState<LinearProjectList>();
  useEffect(() => {
    setList(undefined);
    if (!o.enabled || !o.teamId) return;
    let live = true;
    trackerApi.linearProjects(o.teamId, o.apiKey).then(
      (l) => live && setList(l),
      (e: Error) => live && setList({ kind: 'error', error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [o.enabled, o.teamId, o.apiKey]);
  return list;
}
