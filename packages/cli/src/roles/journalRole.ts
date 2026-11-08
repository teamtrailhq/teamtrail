import { ROLES_JOURNAL, type RoleAction } from '@teamtrail/core';
import { journalFile } from '@teamtrail/core/agents';

/** Records a role change made from the CLI, as the trail lead, in the project's role history. */
export function journalRole(root: string, e: { action: RoleAction; role: string; version?: string; check?: string }) {
  journalFile(root).append({
    v: 1,
    kind: 'role',
    at: Date.now(),
    actor: 'trail lead',
    actorKind: 'trail lead',
    mapId: ROLES_JOURNAL,
    ...e,
  });
}
