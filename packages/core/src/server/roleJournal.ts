import { journalFile } from '../history/journalFile';
import { ROLES_JOURNAL, type RoleAction } from '../model/lifecycle';
import { readRolesConfig } from '../roles/rolesConfig';
import { listRoles } from '../roles/roleStore';

export const TRAIL_LEAD = 'trail lead';

/** Everything Settings → Roles shows: the roles with their status, and the catalogs. */
export const rolesView = (root: string) => {
  const { config, errors } = readRolesConfig(root);
  return { roles: listRoles(root), registries: config.registries, configErrors: errors };
};

/** Records a trail lead's role change in the trail's history, or the project's for install and approval. */
export function journalRole(
  root: string,
  e: { action: RoleAction; role: string; mapId?: string; version?: string; ticketId?: string; check?: string },
) {
  journalFile(root).append({
    v: 1,
    kind: 'role',
    at: Date.now(),
    actor: TRAIL_LEAD,
    actorKind: 'trail lead',
    ...e,
    mapId: e.mapId ?? ROLES_JOURNAL,
  });
}
