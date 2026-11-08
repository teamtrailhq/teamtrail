import path from 'node:path';
import { removeRole } from '@teamtrail/core/agents';
import { journalRole } from './journalRole';
import { rolesAdd } from './rolesAdd';
import { parseRolesArgs } from './rolesArgs';
import { rolesLint } from './rolesLint';
import { rolesList } from './rolesList';
import { rolesSearch } from './rolesSearch';
import { rolesUpdate } from './rolesUpdate';
import type { RolesArgs, RolesIo } from './types';

export const ROLES_USAGE = 'usage: roles search|add|update|remove|list|lint … (see --help)';

function rolesRemove(a: RolesArgs, io: RolesIo) {
  const id = a.rest[0];
  if (!id) {
    io.err('usage: roles remove <id>\n');
    return 2;
  }
  const r = removeRole({ root: path.resolve(a.dir), id });
  journalRole(path.resolve(a.dir), { action: 'removed', role: id });
  io.out(
    `Removed ${id}${r.builtinBack ? '; the built-in role is back' : ''}. Its approved checks stay in verification.json.\n`,
  );
  return 0;
}

const COMMANDS: Record<string, (a: RolesArgs, io: RolesIo) => number | Promise<number>> = {
  add: rolesAdd,
  update: rolesUpdate,
  remove: rolesRemove,
  list: rolesList,
  search: rolesSearch,
  lint: rolesLint,
};

/** `teamtrail roles …`: runs one subcommand and returns its exit code; errors are printed, never thrown. */
export async function runRoles(argv: string[], io: RolesIo): Promise<number> {
  const a = parseRolesArgs(argv);
  if ('error' in a) {
    io.err(`${a.error}\n${ROLES_USAGE}\n`);
    return 2;
  }
  const run = COMMANDS[a.command];
  if (!run) {
    io.err(`${ROLES_USAGE}\n`);
    return 2;
  }
  try {
    return await run(a, io);
  } catch (e) {
    io.err(`${(e as Error).message}\n`);
    return 1;
  }
}
