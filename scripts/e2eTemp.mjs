import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const made = [];

/**
 * A new folder in the temp folder for an end-to-end step, removed when the check's process exits, passed, failed or
 * thrown, with anything made next to it under its name (a repo's worktrees in `<repo>.teamtrail/`). `KEEP=1` keeps
 * them to look at afterwards, and says where they are.
 */
export function e2eTemp(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  if (!made.length) process.once('exit', removeAll);
  made.push(dir);
  return dir;
}

function removeAll() {
  if (process.env.KEEP) {
    console.log(`· kept ${made.join(', ')}`);
    return;
  }
  for (const dir of made.splice(0)) {
    const parent = path.dirname(dir);
    const name = path.basename(dir);
    for (const entry of list(parent)) {
      if (entry !== name && !entry.startsWith(`${name}.`) && !entry.startsWith(`${name}-`)) continue;
      try {
        fs.rmSync(path.join(parent, entry), { recursive: true, force: true, maxRetries: 3 });
      } catch {
        // left for the run's check to report (scripts/testTemp.mjs)
      }
    }
  }
}

function list(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}
