import type { CheckSuggestion } from '@teamtrail/core';
import { commandWords } from './commandWords';

const MAX_SHOWN = 8;
const folderOf = (cwd: string) =>
  cwd
    .trim()
    .replace(/^\.\/?/, '')
    .replace(/\/+$/, '');

/**
 * The suggested checks still worth offering in the editor: none a row already has with the same command and folder
 * (as typed, so a row edited to match counts); at most 8, in the order reading the repo gave them.
 */
export function openSuggestions(
  suggestions: CheckSuggestion[],
  rows: { command: string; cwd: string }[],
): CheckSuggestion[] {
  const had = new Set(rows.map((r) => `${folderOf(r.cwd)}\0${commandWords(r.command).join(' ')}`));
  return suggestions.filter((s) => !had.has(`${folderOf(s.cwd)}\0${s.run.join(' ')}`)).slice(0, MAX_SHOWN);
}
