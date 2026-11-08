import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROLES_DIR, type InstalledRole } from '../model/role';
import { BUILTIN_ROLES } from './builtin/builtinRoles';
import { readRoleLock } from './roleLock';
import { missingRole, roleStatus } from './roleStatus';

export const rolesDir = (root: string) => path.join(root, ROLES_DIR);
export const roleFilePath = (root: string, id: string) => path.join(rolesDir(root), `${id}.md`);

/** The `.md` files in the roles folder, by id (the file name). */
export function readRoleFiles(root: string): { id: string; text: string }[] {
  const dir = rolesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((n) => n.endsWith('.md'))
    .map((n) => ({ id: n.slice(0, -3), text: readFileSync(path.join(dir, n), 'utf8') }));
}

/**
 * Every role the project has: the built-in ones, and the files in `roles/`, each checked against `roles.lock.json`.
 * A file with a built-in's id replaces it. Pinned roles whose file is gone stay listed as tampered. Id order.
 */
export function listRoles(root: string): InstalledRole[] {
  const lock = readRoleLock(root);
  const files = readRoleFiles(root);
  const local = new Set(files.map((f) => f.id));
  const builtins = Object.entries(BUILTIN_ROLES)
    .filter(([id]) => !local.has(id))
    .map(([id, text]) => roleStatus({ id, origin: 'builtin', text }));
  const installed = files.map((f) =>
    roleStatus({ ...f, origin: 'local', lock: lock.roles[f.id], overridesBuiltin: f.id in BUILTIN_ROLES }),
  );
  const gone = Object.entries(lock.roles)
    .filter(([id]) => !local.has(id) && !(id in BUILTIN_ROLES))
    .map(([id, e]) => missingRole(id, e));
  return [...builtins, ...installed, ...gone].sort((a, b) => a.id.localeCompare(b.id));
}

/** Ids of the roles agents can use now. */
export const activeRoleIds = (roles: InstalledRole[]) => roles.filter((r) => r.status === 'active').map((r) => r.id);
