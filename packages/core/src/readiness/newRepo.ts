import type { RepoProfile } from '../model/repoProfile';
import type { TopEntry } from './types';

/** Files at the top that say what a repo is without being part of a project: a readme, a licence, notes for agents. */
const DOC_FILE =
  /^(readme|license|licence|copying|notice|authors|changelog|changes|contributing|code_of_conduct|security|agents|claude)(\.[a-z0-9]+)?$/i;
/** Folders that hold only words. */
const DOC_DIR = new Set(['docs', 'doc']);

const isDoc = (e: TopEntry) => (e.kind === 'dir' ? DOC_DIR.has(e.name.toLowerCase()) : DOC_FILE.test(e.name));

/**
 * Whether the repo has no project yet: reading it found no unit (no manifest of any stack), the whole repo was
 * listed and nothing cut the walk short, and the top holds only documents (a readme, a licence, `docs/`, notes for
 * agents). Dot entries (`.git`, `.gitignore`, the tracker folder) don't count. Deterministic: the same files give
 * the same answer.
 */
export function isNewRepo(o: { profile: RepoProfile; top?: TopEntry[] }): boolean {
  const { profile, top } = o;
  if (!top || !profile.listed || profile.truncated || profile.units.length) return false;
  return top.filter((e) => !e.name.startsWith('.')).every(isDoc);
}
