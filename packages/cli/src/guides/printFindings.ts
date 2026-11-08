import type { GuideFinding } from '@teamtrail/core';
import type { GuidesIo } from './types';

/** Lint findings as `where:line rule message`, errors to stderr and warnings to stdout. */
export function printFindings(io: GuidesIo, where: string, findings: GuideFinding[]) {
  for (const f of findings) {
    const line = `${where}:${f.line} ${f.level} ${f.rule} ${f.message}\n`;
    if (f.level === 'error') io.err(line);
    else io.out(line);
  }
}
