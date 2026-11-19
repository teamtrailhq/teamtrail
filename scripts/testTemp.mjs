// A test run's own temp folder. Every suite (vitest, the node:test runners, the end-to-end check) runs with TMPDIR
// pointed at a fresh `teamtrail-run-<pid>-…` folder, so whatever a test, the CLI it starts, git or Chrome put in "the
// temp folder" lands there, and the folder is removed when the run ends, passed, failed or interrupted. A run killed
// outright leaves its folder; the next run removes it once that process is gone. Before removing it, the run says
// what its tests left behind and fails: each test removes what it made (see AGENTS.md, Checks). Nothing outside
// these run folders is ever deleted.
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const RUN_PREFIX = 'teamtrail-run-';
// Caches tools keep in the temp folder across runs, never a test's own: vite's (and vitest's) Node compile cache.
const TOOL_CACHES = ['node-compile-cache'];

/**
 * Starts a run: `env` is what its processes get (TMPDIR and friends, Chrome's own on macOS), `finish()` reports and
 * removes what is left and returns the leftovers' names. `keep` names entries the runner itself made and removes.
 */
export function testTemp(label) {
  const base = process.env.TEAMTRAIL_REAL_TMPDIR || os.tmpdir();
  sweepDeadRuns(base);
  const dir = mkdtempSync(path.join(base, `${RUN_PREFIX}${process.pid}-${label}-`));
  const env = {
    TEAMTRAIL_REAL_TMPDIR: base,
    TMPDIR: dir,
    TMP: dir,
    TEMP: dir,
    MAC_CHROMIUM_TMPDIR: dir,
  };
  let done = false;
  const finish = ({ expected = [] } = {}) => {
    if (done) return [];
    done = true;
    const left = list(dir).filter((name) => !expected.includes(name) && !TOOL_CACHES.includes(name));
    rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    return left;
  };
  return { dir, env, finish };
}

function list(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

/** Run folders whose process is gone: a run killed before it could clean up. */
function sweepDeadRuns(base) {
  for (const name of list(base)) {
    if (!name.startsWith(RUN_PREFIX)) continue;
    const pid = Number(name.slice(RUN_PREFIX.length).split('-')[0]);
    if (!Number.isInteger(pid) || pid <= 0 || alive(pid)) continue;
    rmSync(path.join(base, name), { recursive: true, force: true, maxRetries: 3 });
  }
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}
