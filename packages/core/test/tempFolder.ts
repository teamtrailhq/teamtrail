import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const made: string[] = [];

/**
 * A new folder in the temp folder for a node:test file, removed when the file's process exits, passed or failed,
 * together with anything made next to it under its name (a repo's worktrees in `<repo>.teamtrail/`, `<dir>-wt`,
 * `<dir>.sh`). node:test runs each file in its own process. vitest files remove theirs in `afterEach`/`afterAll`.
 */
export function tempFolder(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  if (!made.length) process.once('exit', removeAll);
  made.push(dir);
  return dir;
}

function removeAll() {
  for (const dir of made.splice(0)) {
    const parent = path.dirname(dir);
    const name = path.basename(dir);
    for (const entry of siblings(parent)) {
      if (entry === name || entry.startsWith(`${name}.`) || entry.startsWith(`${name}-`)) {
        remove(path.join(parent, entry));
      }
    }
  }
}

function siblings(parent: string): string[] {
  try {
    return readdirSync(parent);
  } catch {
    return [];
  }
}

/** Never throws while the process exits: what can't be removed shows up in the run's leftovers (scripts/testTemp.mjs). */
function remove(p: string) {
  try {
    rmSync(p, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // left for the run's check to report
  }
}
