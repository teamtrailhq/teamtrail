import { useCallback, useSyncExternalStore } from 'react';
import { postRoles } from './rolesApi';
import { rolesSnapshot, setRolesView, subscribeRoles } from './rolesStore';
import type { RolesView } from './types';

/**
 * The project's roles (built in and installed, each with its status) and the trail lead's actions on them.
 * `act` posts to a roles route and resolves to an error message, if any.
 */
export function useRoles() {
  const view = useSyncExternalStore(subscribeRoles, rolesSnapshot);
  const act = useCallback(async (path: string, body: unknown): Promise<string | undefined> => {
    try {
      setRolesView(await postRoles<RolesView>(path, body));
      return undefined;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);
  const find = useCallback((id?: string) => (id ? view?.roles.find((r) => r.id === id) : undefined), [view]);
  return { view, act, find };
}
