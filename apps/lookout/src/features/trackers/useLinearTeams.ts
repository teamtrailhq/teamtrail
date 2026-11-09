import type { LinearTeamList } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { trackerApi } from './trackerApi';

/**
 * The teams a Linear key can access, with who it belongs to: the found key, or `apiKey` pasted in the page.
 * Undefined while loading or when `enabled` is off.
 */
export function useLinearTeams(o: { enabled: boolean; apiKey?: string }) {
  const [list, setList] = useState<LinearTeamList>();
  useEffect(() => {
    setList(undefined);
    if (!o.enabled) return;
    let live = true;
    trackerApi.linearTeams(o.apiKey).then(
      (l) => live && setList(l),
      (e: Error) => live && setList({ kind: 'error', error: e.message }),
    );
    return () => {
      live = false;
    };
  }, [o.enabled, o.apiKey]);
  return list;
}
