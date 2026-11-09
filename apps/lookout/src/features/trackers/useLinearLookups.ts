import type { TrackerSettings } from '@teamtrail/core';
import { useDebounced } from './useDebounced';
import { useLinearProjects } from './useLinearProjects';
import { useLinearTeams } from './useLinearTeams';

/**
 * The teams and the picked team's projects for the Linear setup: with the found key, or with a pasted one once it
 * has stopped changing. `enabled` is false until there is a key to ask with; `loading` while either lookup is out.
 */
export function useLinearLookups(o: { ln: TrackerSettings['linear']; paste: boolean; apiKey: string; teamId: string }) {
  const pasted = useDebounced(o.apiKey.trim(), 400);
  const lookupKey = o.paste && pasted ? pasted : undefined;
  const enabled = o.paste ? !!pasted : !!o.ln.auth;
  const teamLookup = useLinearTeams({ enabled, apiKey: lookupKey });
  const projectLookup = useLinearProjects({ teamId: o.teamId, apiKey: lookupKey, enabled });
  const list = teamLookup.list;
  const projects = projectLookup.list;
  const teams = list?.kind === 'ok' ? list.teams : [];
  const teamsLoading = enabled && !list;
  const projectsLoading = enabled && !!o.teamId && !projects;
  return {
    enabled,
    list,
    teams,
    projects,
    loading: teamsLoading || projectsLoading,
    retryTeams: teamLookup.retry,
    retryProjects: projectLookup.retry,
  };
}
