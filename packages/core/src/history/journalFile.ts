import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Journal, JournalEntry, RoleEntry, TransitionEntry } from '../model/lifecycle';

/*
 * Trail history, one JSON line per transition, reroute step or role change, append-only:
 *   <tracker dir>/.events/<mapId>.jsonl
 *   <tracker dir>/.events/.gitignore      `*`: local history, never committed
 * Lines stay well under 4 KB, so concurrent appends from several processes never interleave.
 * `read` returns transitions only, so older readers (delivery report, Report tab) are unaffected by newer kinds;
 * `readAll` returns transitions and reroute steps and skips the rest (role changes included); `readRoles` returns the
 * role changes.
 */
const KNOWN_KINDS = new Set<string>(['transition', 'reroute', 'role']);
export const JOURNAL_DIR = '.events';

const MAX_REASON = 500;
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

export const journalPath = (root: string, mapId: string) => path.join(root, JOURNAL_DIR, `${safe(mapId)}.jsonl`);

export function journalFile(root: string): Journal & {
  append(entry: JournalEntry | RoleEntry): void;
  read(mapId: string): TransitionEntry[];
  readAll(mapId: string): JournalEntry[];
  readRoles(mapId: string): RoleEntry[];
} {
  const raw = (mapId: string) => readEntries(root, mapId) as (JournalEntry | RoleEntry)[];
  const readAll = (mapId: string) =>
    raw(mapId).filter((e): e is JournalEntry => KNOWN_KINDS.has(e.kind) && e.kind !== 'role');
  return {
    append(entry: JournalEntry | RoleEntry) {
      const dir = path.join(root, JOURNAL_DIR);
      mkdirSync(dir, { recursive: true });
      const ignore = path.join(dir, '.gitignore');
      if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
      const line = { ...entry, ...(entry.reason ? { reason: entry.reason.slice(0, MAX_REASON) } : {}) };
      appendFileSync(journalPath(root, entry.mapId), JSON.stringify(line) + '\n');
    },
    read: (mapId) => readAll(mapId).filter((e): e is TransitionEntry => e.kind === 'transition'),
    readAll,
    readRoles: (mapId) => raw(mapId).filter((e): e is RoleEntry => e.kind === 'role'),
  };
}

/** Every v1 line of the file; a torn last line after a crash is skipped. */
function readEntries(root: string, mapId: string): JournalEntry[] {
  let text = '';
  try {
    text = readFileSync(journalPath(root, mapId), 'utf8');
  } catch {
    return [];
  }
  const out: JournalEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as JournalEntry;
      // The first journals had transitions only; a line without a kind is one.
      if (e.v === 1) out.push({ ...e, kind: e.kind ?? 'transition' } as JournalEntry);
    } catch {
      // skipped
    }
  }
  return out;
}
