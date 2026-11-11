import { appendFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { JOURNAL_DIR } from '../history/journalFile';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { FlagEntry, PrSyncStatus, TicketSync } from '../model/prEvidence';
import { EVIDENCE_DIR, evidencePaths } from '../verification/evidenceStore';

/*
 * Reconciler output, local and gitignored like the rest of the evidence:
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/sync.json   TicketSync, rewritten every tick
 *   <tracker dir>/.evidence/sync-status.json               PrSyncStatus of the last tick
 *   <tracker dir>/.events/flags/<mapId>.jsonl              FlagEntry per raised or cleared flag, append-only
 */
const SYNC_FILE = 'sync.json';
const STATUS_FILE = 'sync-status.json';
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

const ticketFile = (root: string, mapId: string, ticketId: string) =>
  path.join(root, evidencePaths.ticket(mapId, ticketId), SYNC_FILE);

const ignored = (root: string, dir: string) => ensureLocalDir(path.join(root, dir));

export function readTicketSync(root: string, mapId: string, ticketId: string) {
  const s = readJsonFile<TicketSync>(ticketFile(root, mapId, ticketId));
  return s?.v === 1 ? s : undefined;
}

export function writeTicketSync(root: string, s: TicketSync) {
  ignored(root, EVIDENCE_DIR);
  writeJsonAtomic(ticketFile(root, s.mapId, s.ticketId), s);
}

export function dropTicketSync(root: string, mapId: string, ticketId: string) {
  rmSync(ticketFile(root, mapId, ticketId), { force: true });
}

/** Every ticket's snapshot, optionally of one trail. */
export function readTicketSyncs(root: string, mapId?: string): TicketSync[] {
  const base = path.join(root, EVIDENCE_DIR);
  const list = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {
      return [];
    }
  };
  const maps = mapId === undefined ? list(base).map((d) => d.name) : [safe(mapId)];
  const out: TicketSync[] = [];
  for (const m of maps)
    for (const t of list(path.join(base, m))) {
      const s = readJsonFile<TicketSync>(path.join(base, m, t.name, SYNC_FILE));
      if (s?.v === 1) out.push(s);
    }
  return out;
}

export const readSyncStatus = (root: string): PrSyncStatus =>
  readJsonFile<PrSyncStatus>(path.join(root, EVIDENCE_DIR, STATUS_FILE)) ?? { state: 'off', reason: 'not started' };

export function writeSyncStatus(root: string, s: PrSyncStatus) {
  ignored(root, EVIDENCE_DIR);
  writeJsonAtomic(path.join(root, EVIDENCE_DIR, STATUS_FILE), s);
}

export function appendFlagEntry(root: string, e: FlagEntry) {
  ignored(root, JOURNAL_DIR);
  const dir = path.join(root, JOURNAL_DIR, 'flags');
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, `${safe(e.mapId)}.jsonl`), JSON.stringify({ ...e, text: e.text.slice(0, 300) }) + '\n');
}
