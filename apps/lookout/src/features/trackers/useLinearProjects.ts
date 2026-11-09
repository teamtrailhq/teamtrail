import type { LinearProjectList } from '@teamtrail/core';
import { trackerApi } from './trackerApi';
import { useLookup } from './useLookup';

/** The projects of the picked Linear team; `list` is undefined while loading or with no team picked. */
export function useLinearProjects(o: { teamId: string; apiKey?: string; enabled: boolean }) {
  const { value: list, retry } = useLookup<LinearProjectList>({
    enabled: o.enabled && !!o.teamId,
    key: `${o.teamId}\n${o.apiKey ?? ''}`,
    load: () => trackerApi.linearProjects(o.teamId, o.apiKey),
    failed: (error) => ({ kind: 'error', error }),
  });
  return { list, retry };
}
