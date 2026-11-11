import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import type { VerificationAttempt } from '../model/verification';
import { readAttempt, writeAttempt } from './evidenceStore';

/**
 * One verification run per ticket at a time, across processes:
 *   <tracker>/.agents/runs/<mapId>--<ticketId>.json   RunLock
 * The lock carries the submission, so a run whose process died can still be
 * recorded as an `interrupted` attempt.
 */
export const RUNS_DIR = `${AGENTS_DIR}/runs`;

export type RunLock = Omit<VerificationAttempt, 'finishedAt' | 'checks' | 'result' | 'note'> & {
  pid: number;
  startedAt: number;
};

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const lockFile = (root: string, mapId: string, ticketId: string) =>
  path.join(root, RUNS_DIR, `${safe(mapId)}--${safe(ticketId)}.json`);

export const readRunLock = (root: string, mapId: string, ticketId: string) =>
  readJsonFile<RunLock>(lockFile(root, mapId, ticketId));

export function readRunLocks(root: string): RunLock[] {
  let names: string[] = [];
  try {
    names = readdirSync(path.join(root, RUNS_DIR)).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names
    .map((n) => readJsonFile<RunLock>(path.join(root, RUNS_DIR, n)))
    .filter((l): l is RunLock => l?.v === 1 && !!l.ticketId);
}

/** Records the dead run behind `lock` as interrupted and removes the lock; only one process wins the removal. */
function recover(root: string, lock: RunLock, now: number): VerificationAttempt | undefined {
  const file = lockFile(root, lock.mapId, lock.ticketId);
  const claimed = `${file}.${process.pid}.recover`;
  try {
    renameSync(file, claimed);
  } catch {
    return undefined;
  }
  const held = readJsonFile<RunLock>(claimed);
  rmSync(claimed, { force: true });
  if (held && held.pid !== lock.pid) {
    // a live run took the lock between our read and the rename: put it back
    try {
      writeFileSync(file, JSON.stringify(held, null, 2), { flag: 'wx' });
    } catch {
      // someone else holds it now
    }
    return undefined;
  }
  if (!held) return undefined;
  if (readAttempt(root, held.mapId, held.ticketId, held.id)) return undefined;
  const { pid: _pid, startedAt: _startedAt, ...submission } = held;
  const a: VerificationAttempt = {
    ...submission,
    finishedAt: now,
    checks: [],
    result: 'interrupted',
    note: `verification process ${held.pid} stopped before the checks finished`,
  };
  try {
    writeAttempt(root, a);
  } catch {
    return undefined;
  }
  return a;
}

/**
 * Takes the ticket's run lock. A lock left by a dead process is recovered
 * (its run recorded as interrupted) and taken over; a live one wins.
 */
export function acquireRunLock(
  root: string,
  lock: Omit<RunLock, 'pid' | 'startedAt'>,
  now = Date.now(),
): { ok: true; lock: RunLock; recovered?: VerificationAttempt } | { ok: false; holder: RunLock } {
  const file = lockFile(root, lock.mapId, lock.ticketId);
  const mine: RunLock = { ...lock, pid: process.pid, startedAt: now };
  let recovered: VerificationAttempt | undefined;
  ensureLocalDir(path.join(root, AGENTS_DIR));
  mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; i < 3; i++) {
    try {
      writeFileSync(file, JSON.stringify(mine, null, 2), { flag: 'wx' });
      return { ok: true, lock: mine, ...(recovered ? { recovered } : {}) };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    const holder = readRunLock(root, lock.mapId, lock.ticketId);
    if (holder && processAlive(holder.pid)) return { ok: false, holder };
    if (holder) recovered = recover(root, holder, now) ?? recovered;
    else rmSync(file, { force: true });
  }
  const holder = readRunLock(root, lock.mapId, lock.ticketId);
  if (holder) return { ok: false, holder };
  throw new Error(`could not take the run lock for ${lock.ticketKey}`);
}

/** Drops the lock if this process holds it. */
export function releaseRunLock(root: string, mapId: string, ticketId: string, pid = process.pid) {
  const held = readRunLock(root, mapId, ticketId);
  if (held?.pid === pid) rmSync(lockFile(root, mapId, ticketId), { force: true });
}

/** On startup: every run whose process is gone becomes an interrupted attempt. */
export const recoverInterrupted = (root: string, now = Date.now()) =>
  readRunLocks(root)
    .filter((l) => !processAlive(l.pid))
    .map((l) => recover(root, l, now))
    .filter((a): a is VerificationAttempt => !!a);
