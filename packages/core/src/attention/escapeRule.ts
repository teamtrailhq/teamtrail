import type { Escape } from '../model/escape';

/** How many globs a suggested rule starts with; the human trims or widens them in the Rules editor. */
const MAX_GLOBS = 5;
/** Plain repo paths only: nothing a comma-separated link or a glob would read as more than a path. */
const PLAIN_PATH = /^[\w./@+-]+$/;

/** A changed file's folder as a glob (`src/auth/login.ts` → `src/auth/**`); a file at the top stays itself. */
function globOf(file: string) {
  const at = file.lastIndexOf('/');
  return at > 0 ? `${file.slice(0, at)}/**` : file;
}

/**
 * The diff rule an escape suggests: the folders of the files the verified work changed, and why, in the words the
 * Rules editor shows ("#7 was verified, then reverted"). Deterministic: the same escape gives the same rule.
 */
export function escapeRule(e: Escape): { when: string[]; why: string } {
  const plain = e.files.filter((f) => PLAIN_PATH.test(f) && !f.split('/').includes('..'));
  const when = [...new Set(plain.map(globOf))].sort().slice(0, MAX_GLOBS);
  return { when, why: `${e.ticketKey} was verified, then ${e.kind}` };
}
