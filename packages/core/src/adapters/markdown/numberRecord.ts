import path from 'node:path';
import { AGENTS_DIR } from '../../agents/agentLink';
import { ensureLocalDir } from '../../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../../lib/jsonFile';
import { withFileLock } from '../../machine/withFileLock';

/** The highest issue number handed out in this tracker folder: `{ "highest": n }`. Local only. */
export const NUMBERS_FILE = `${AGENTS_DIR}/numbers.json`;

/**
 * Hands out the next issue number for a new trail or ticket (`#n`): at least `atLeast` (the highest number the
 * tracker's files name, plus one) and above every number handed out here before, then records it, under a lock every
 * Teamtrail process takes. So processes creating trails and tickets at once never get the same number, and the number
 * of a trail or ticket that was removed is never given again. Existing trails and tickets keep theirs.
 */
export function reserveNumber(root: string, atLeast: number): number {
  const agents = path.join(root, AGENTS_DIR);
  ensureLocalDir(agents);
  const file = path.join(root, NUMBERS_FILE);
  return withFileLock(path.join(agents, 'numbers.lock'), () => {
    const highest = Number(readJsonFile<{ highest?: unknown }>(file)?.highest);
    const n = Math.max(Math.floor(atLeast) || 1, (Number.isSafeInteger(highest) ? highest : 0) + 1);
    writeJsonAtomic(file, { highest: n });
    return n;
  });
}
