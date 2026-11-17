import type { CheckFinding } from '@teamtrail/core';

/** A finding on a row being edited, with the command (as words joined by spaces) it was about. */
export type RowFinding = CheckFinding & { command: string };

const asWords = (command: string) => command.trim().split(/\s+/).filter(Boolean).join(' ');

/**
 * The editor's findings per row. Rows are screened under their index as the check's name (names may be blank or
 * repeated while typing); a finding shows only while its row still has the command it was about, and none shows
 * on a row whose command the person chose to keep anyway, until it changes.
 */
export function rowFindings(o: { findings: RowFinding[]; rows: { command: string }[]; kept: ReadonlySet<string> }) {
  return o.rows.map((row, n): CheckFinding[] => {
    const command = asWords(row.command);
    if (o.kept.has(command)) return [];
    return o.findings.filter((f) => f.check === String(n) && f.command === command);
  });
}
