import type { LinearTeamList } from '@teamtrail/core';
import { trackerApi } from './trackerApi';
import { useLookup } from './useLookup';

/**
 * The teams a Linear key can access, with who it belongs to: the found key, or `apiKey` pasted in the page.
 * `list` is undefined while loading or when `enabled` is off.
 */
export function useLinearTeams(o: { enabled: boolean; apiKey?: string }) {
  const { value: list, retry } = useLookup<LinearTeamList>({
    enabled: o.enabled,
    key: o.apiKey ?? '',
    load: () => trackerApi.linearTeams(o.apiKey),
    failed: (error) => ({ kind: 'error', error }),
  });
  return { list, retry };
}
