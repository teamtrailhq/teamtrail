import path from 'node:path';
import { listRoles } from '@teamtrail/core/agents';
import type { RolesArgs, RolesIo } from './types';

/** `roles list`: every role the project has, where it comes from, and whether agents can use it. */
export function rolesList(a: RolesArgs, io: RolesIo): number {
  const roles = listRoles(path.resolve(a.dir));
  if (a.json) {
    io.out(`${JSON.stringify(roles, null, 2)}\n`);
    return 0;
  }
  for (const r of roles) {
    const origin = originOf(r.origin, typeof r.lock?.source === 'object');
    const version = r.role?.version ?? r.lock?.version ?? '?';
    const status = r.status === 'active' ? 'active' : `${r.status}: ${r.reason ?? ''}`;
    const pending = r.pendingChecks.length ? ` · checks to approve: ${r.pendingChecks.join(', ')}` : '';
    io.out(`${r.id.padEnd(14)} ${version.padEnd(8)} ${origin.padEnd(9)} ${status}${pending}\n`);
  }
  return 0;
}

function originOf(origin: 'builtin' | 'local', fromCatalog: boolean) {
  if (origin === 'builtin') return 'built in';
  return fromCatalog ? 'catalog' : 'local';
}
