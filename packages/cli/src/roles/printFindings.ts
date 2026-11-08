import type { RoleFinding } from '@teamtrail/core';
import type { RolesIo } from './types';

/** Lint findings as `where:line rule message`, errors to stderr and warnings to stdout. */
export function printFindings(io: RolesIo, where: string, findings: RoleFinding[]) {
  for (const f of findings) {
    const line = `${where}:${f.line} ${f.level} ${f.rule} ${f.message}\n`;
    if (f.level === 'error') io.err(line);
    else io.out(line);
  }
}
