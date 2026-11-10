import { readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { leasePaths, type TicketLease } from './ticketLease';

const MAX_NOTES = 20;
const file = (root: string, mapId: string, ticketId: string) => path.join(root, leasePaths.lease(mapId, ticketId));

/** Leases and tombstones under `root`, by file. */
export function readLeases(root: string): TicketLease[] {
  const dir = path.join(root, leasePaths.dir);
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names
    .map((n) => readJsonFile<TicketLease>(path.join(dir, n)))
    .filter((l): l is TicketLease => l?.v === 1 && !!l.ticketId);
}

export function readLease(root: string, mapId: string, ticketId: string) {
  const l = readJsonFile<TicketLease>(file(root, mapId, ticketId));
  return l?.v === 1 ? l : undefined;
}

export function writeLease(root: string, l: TicketLease) {
  writeLocalJson(root, leasePaths.lease(l.mapId, l.ticketId), l);
}

export function dropLease(root: string, mapId: string, ticketId: string) {
  rmSync(file(root, mapId, ticketId), { force: true });
}

/**
 * Extends a live lease held by `agent`; returns it, or undefined when the lease
 * is gone, returned to the queue or held by someone else.
 */
export function renewLease(
  root: string,
  holder: { mapId: string; ticketId: string; agent: string },
  patch: { note?: string; decision?: string; sessionId?: string } = {},
  now = Date.now(),
): TicketLease | undefined {
  const { mapId, ticketId, agent } = holder;
  const l = readLease(root, mapId, ticketId);
  if (!l || l.returned || l.agent !== agent) return undefined;
  const next: TicketLease = {
    ...l,
    pid: process.pid,
    sessionId: patch.sessionId ?? l.sessionId,
    renewedAt: now,
    expiresAt: now + l.ttlMs,
    notes: patch.note && l.notes.at(-1) !== patch.note ? [...l.notes, patch.note].slice(-MAX_NOTES) : l.notes,
    decisions: patch.decision ? [...l.decisions, patch.decision] : l.decisions,
  };
  writeLease(root, next);
  return next;
}

/**
 * Takes a lease for returning it: an atomic rename, so of several processes
 * reaping the same lease exactly one gets it. Undefined when another got it first.
 */
export function takeLease(
  root: string,
  l: TicketLease,
): { lease: TicketLease; put(l: TicketLease): void; drop(): void } | undefined {
  const from = file(root, l.mapId, l.ticketId);
  const to = `${from}.${process.pid}.taking`;
  try {
    renameSync(from, to);
  } catch {
    return undefined;
  }
  const taken = readJsonFile<TicketLease>(to) ?? l;
  return {
    lease: taken,
    put(next) {
      writeLease(root, next);
      rmSync(to, { force: true });
    },
    drop() {
      rmSync(to, { force: true });
    },
  };
}
