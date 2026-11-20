import type { CheckSuggestion } from '@teamtrail/core';

/**
 * A suggested check as a new editor row: its command, folder and paths (a monorepo package's own folder), its name
 * numbered when a row already has it.
 */
export function rowOfSuggestion(s: CheckSuggestion, rows: { name: string }[]) {
  const taken = new Set(rows.map((r) => r.name.trim()));
  let name = s.name;
  for (let n = 2; taken.has(name); n++) name = `${s.name}-${n}`;
  return { name, command: s.run.join(' '), cwd: s.cwd, paths: (s.paths ?? []).join(', ') };
}
