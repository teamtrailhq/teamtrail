import { lintRole, type RoleDoc, type RoleLockSource } from '@teamtrail/core';
import { installRole } from '@teamtrail/core/agents';
import { approvePending } from './approvePending';
import { journalRole } from './journalRole';
import { printFindings } from './printFindings';
import type { RolesIo } from './types';

const PREVIEW_LINES = 12;

function describe(io: RolesIo, role: RoleDoc) {
  const lines = role.instructions.split('\n');
  const preview = lines.slice(0, PREVIEW_LINES).map((l) => `    │ ${l}`);
  const more = lines.length > PREVIEW_LINES ? [`    │ … ${lines.length - PREVIEW_LINES} more lines`] : [];
  io.out(
    [
      '',
      `  ${role.name} (${role.id}) ${role.version} · by ${role.author} · ${role.license}`,
      `  ${role.summary}`,
      `  For: ${role.handles.types.join(', ')} tickets · checklist: ${role.checklist.length} items`,
      `  Requires checks: ${role.requiresChecks.join(', ') || 'none'}`,
      ...(role.preferredAgent ? [`  Preferred agent (advisory): ${role.preferredAgent}`] : []),
      '',
      ...preview,
      ...more,
      '',
    ].join('\n') + '\n',
  );
}

/**
 * Lints a role file (refusing it on any error, each named by line), shows what it is, copies it into the roles folder
 * and pins it, then asks about each proposed check it wants. Returns the exit code.
 */
export async function installText(input: {
  root: string;
  text: string;
  source: RoleLockSource;
  where: string;
  io: RolesIo;
  approveAll: boolean;
  expectId?: string;
}): Promise<number> {
  const { io } = input;
  const lint = lintRole(input.text);
  printFindings(io, input.where, lint.findings);
  if (!lint.ok || !lint.role) {
    io.err(`Refused: ${input.where} fails the role lint; nothing was installed.\n`);
    return 1;
  }
  describe(io, lint.role);
  const r = installRole({ ...input, by: 'trail lead' });
  journalRole(input.root, { action: r.updated ? 'updated' : 'installed', role: r.role.id, version: r.role.version });
  io.out(`  ${r.updated ? 'Updated' : 'Added'} ${r.role.id} ${r.role.version}, pinned in roles.lock.json.\n`);
  await approvePending({ root: input.root, role: r.role, pending: r.pendingChecks, io, approveAll: input.approveAll });
  return 0;
}
