import { onTrackerChange } from '../../lib/trackerChanges';
import { getRoles } from './rolesApi';
import type { RolesView } from './types';

/*
 * One shared copy of GET /roles for every component that shows a role (map nodes, the inspector, Settings), so a map
 * with fifty tickets makes one request. Reloaded when a file under roles/ or the role lock changes.
 * undefined while loading, null without a server (static build).
 */
let view: RolesView | null | undefined;
const subscribers = new Set<() => void>();
let unwatch: (() => void) | undefined;

export function setRolesView(next: RolesView | null) {
  view = next;
  for (const s of subscribers) s();
}

export function loadRoles() {
  getRoles<RolesView>('/roles').then(setRolesView, () => setRolesView(null));
}

export const rolesSnapshot = () => view;

export function subscribeRoles(cb: () => void) {
  subscribers.add(cb);
  if (!unwatch) {
    loadRoles();
    unwatch = onTrackerChange((p) => {
      if (p.includes('roles')) loadRoles();
    });
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size) return;
    unwatch?.();
    unwatch = undefined;
  };
}
