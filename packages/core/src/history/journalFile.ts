import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import type {
  GuideEntry,
  Journal,
  JournalEntry,
  RemoteAgentEntry,
  SlackOwnerEntry,
  TransitionEntry,
  TrustEntry,
} from '../model/lifecycle';

/*
 * Trail history, one JSON line per transition, reroute step, guide change, remote-agent token change or Slack owner
 * change, append-only:
 *   <tracker dir>/.events/<mapId>.jsonl
 *   <tracker dir>/.events/.gitignore      `*`: local history, never committed
 * Lines stay well under 4 KB, so concurrent appends from several processes never interleave.
 * `read` returns transitions only, so older readers (delivery report, Report tab) are unaffected by newer kinds;
 * `readAll` returns transitions and reroute steps and skips the rest (guide and remote-agent changes included, and
 * kinds a newer version wrote); `readGuides` returns the guide changes, `readRemoteAgents` the token changes,
 * `readSlack` the Slack owner changes.
 */
const TRAIL_KINDS = new Set<string>(['transition', 'reroute']);
type AnyEntry = JournalEntry | GuideEntry | RemoteAgentEntry | SlackOwnerEntry | TrustEntry;
export const JOURNAL_DIR = '.events';

const MAX_REASON = 500;
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

export const journalPath = (root: string, mapId: string) => path.join(root, JOURNAL_DIR, `${safe(mapId)}.jsonl`);

export function journalFile(root: string): Journal & {
  append(entry: AnyEntry): void;
  read(mapId: string): TransitionEntry[];
  readAll(mapId: string): JournalEntry[];
  readGuides(mapId: string): GuideEntry[];
  readRemoteAgents(mapId: string): RemoteAgentEntry[];
  readSlack(mapId: string): SlackOwnerEntry[];
  readTrust(mapId: string): TrustEntry[];
} {
  const raw = (mapId: string) => readEntries(root, mapId) as AnyEntry[];
  const readAll = (mapId: string) => raw(mapId).filter((e): e is JournalEntry => TRAIL_KINDS.has(e.kind));
  return {
    append(entry: AnyEntry) {
      ensureLocalDir(path.join(root, JOURNAL_DIR));
      const line = { ...entry, ...(entry.reason ? { reason: entry.reason.slice(0, MAX_REASON) } : {}) };
      appendFileSync(journalPath(root, entry.mapId), JSON.stringify(line) + '\n');
    },
    read: (mapId) => readAll(mapId).filter((e): e is TransitionEntry => e.kind === 'transition'),
    readAll,
    readGuides: (mapId) => raw(mapId).filter((e): e is GuideEntry => e.kind === 'guide'),
    readRemoteAgents: (mapId) => raw(mapId).filter((e): e is RemoteAgentEntry => e.kind === 'remote-agent'),
    readSlack: (mapId) => raw(mapId).filter((e): e is SlackOwnerEntry => e.kind === 'slack'),
    readTrust: (mapId) => raw(mapId).filter((e): e is TrustEntry => e.kind === 'trust'),
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
