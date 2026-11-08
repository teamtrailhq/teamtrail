import type { RoleDoc } from '@teamtrail/core';
import { approveCheck } from '@teamtrail/core/agents';
import { journalRole } from './journalRole';
import type { RolesIo } from './types';

/**
 * Asks the trail lead about each proposed check still waiting for approval, showing its argv. Without a person at the
 * terminal nothing is approved unless `approveAll` (`--approve-checks`) was given explicitly. Returns what is left.
 */
export async function approvePending(input: {
  root: string;
  role: RoleDoc;
  pending: string[];
  io: RolesIo;
  approveAll: boolean;
}): Promise<string[]> {
  const { role, io } = input;
  const left: string[] = [];
  for (const name of input.pending) {
    const spec = role.proposedChecks[name];
    io.out(`  check ${name}: ${JSON.stringify(spec.run)}${spec.cwd ? ` in ${spec.cwd}` : ''}\n`);
    const yes = await decide(input, name);
    if (!yes) {
      left.push(name);
      continue;
    }
    approveCheck({ root: input.root, id: role.id, name });
    journalRole(input.root, { action: 'check-approved', role: role.id, version: role.version, check: name });
    io.out(`    approved: written to verification.json\n`);
  }
  if (left.length)
    io.out(
      `\n  Not approved yet: ${left.join(', ')}. They don't run until you approve them in the Lookout (Settings → Roles), or rerun with --approve-checks.\n`,
    );
  return left;
}

async function decide(input: { io: RolesIo; approveAll: boolean; role: RoleDoc }, name: string) {
  if (input.approveAll) return true;
  if (!input.io.interactive) return false;
  return input.io.confirm(`    Approve ${name} for ${input.role.id}? [y/N] `);
}
