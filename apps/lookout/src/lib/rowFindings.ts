import type { CheckFinding } from '@teamtrail/core';
import { commandWords } from './commandWords';

/** A finding on a row being edited, with the command (as words joined by spaces) it was about. */
export type RowFinding = CheckFinding & { command: string };

/**
 * The editor's findings per row. Rows are screened under their index as the check's name (names may be blank or
 * repeated while typing); a finding shows only while its row still has the command it was about.
 */
export function rowFindings(o: { findings: RowFinding[]; rows: { command: string }[] }) {
  return o.rows.map((row, n): CheckFinding[] => {
    const command = commandWords(row.command).join(' ');
    return o.findings.filter((f) => f.check === String(n) && f.command === command);
  });
}
