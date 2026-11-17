import { closeSync, openSync, rmSync, writeSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir, writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import type { MainRun } from '../model/mainChecks';
import { EVIDENCE_DIR } from '../verification/evidenceStore';

/*
 * Runs of the approved checks on the default branch, local to this machine, next to the tickets' evidence:
 *   <tracker dir>/.evidence/_main/latest.json          { id }: the run every trail reads
 *   <tracker dir>/.evidence/_main/runs/<id>.json       MainRun
 *   <tracker dir>/.evidence/_main/runs/<id>/<check>.log
 *   <tracker dir>/.evidence/_main/running.json         { id, pid, at }: one run at a time, across processes
 */
export const MAIN_DIR = `${EVIDENCE_DIR}/_main`;
const RUNNING = `${MAIN_DIR}/running.json`;
/** Past this, a run whose process is still alive is taken for stuck all the same. */
const STUCK_MARGIN_MS = 5 * 60_000;

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

export const mainPaths = {
  run: (id: string) => `${MAIN_DIR}/runs/${safe(id)}.json`,
  logs: (id: string) => `${MAIN_DIR}/runs/${safe(id)}`,
};

export function readMainRun(root: string, id: string): MainRun | undefined {
  const r = readJsonFile<MainRun>(path.join(root, mainPaths.run(id)));
  return r?.v === 1 ? r : undefined;
}

export function writeMainRun(root: string, run: MainRun) {
  writeLocalJson(root, mainPaths.run(run.id), run);
  writeLocalJson(root, `${MAIN_DIR}/latest.json`, { id: run.id });
}

/** The latest run, with a run whose process is gone (or stuck past `budgetMs`) read as never having happened. */
export function latestMainRun(root: string, budgetMs = 0): MainRun | undefined {
  const id = readJsonFile<{ id?: string }>(path.join(root, MAIN_DIR, 'latest.json'))?.id;
  const run = typeof id === 'string' ? readMainRun(root, id) : undefined;
  if (!run || run.result !== 'running') return run;
  const alive = !!run.pid && processAlive(run.pid);
  const stuck = Date.now() - run.startedAt > budgetMs + STUCK_MARGIN_MS;
  return alive && !stuck ? run : undefined;
}

type Lock = { ok: true; release: () => void } | { ok: false };

/** Takes the one-run-at-a-time lock, taking over one a dead or stuck process left. */
export function lockMainRun(root: string, id: string, budgetMs: number): Lock {
  ensureLocalDir(path.join(root, EVIDENCE_DIR));
  ensureLocalDir(path.join(root, MAIN_DIR));
  const file = path.join(root, RUNNING);
  for (let tries = 0; tries < 2; tries++) {
    try {
      const fd = openSync(file, 'wx');
      writeSync(fd, JSON.stringify({ id, pid: process.pid, at: Date.now() }));
      closeSync(fd);
      return { ok: true, release: () => rmSync(file, { force: true }) };
    } catch {
      const held = readJsonFile<{ pid?: number; at?: number }>(file);
      const live = !!held?.pid && processAlive(held.pid) && Date.now() - (held.at ?? 0) < budgetMs + STUCK_MARGIN_MS;
      if (live) return { ok: false };
      rmSync(file, { force: true });
    }
  }
  return { ok: false };
}
