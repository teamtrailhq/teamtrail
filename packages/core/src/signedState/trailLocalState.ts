import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { JOURNAL_DIR } from '../history/journalFile';
import { REROUTES_DIR } from '../planning/reroute/rerouteStore';
import { EVIDENCE_DIR } from '../verification/evidenceStore';
import { RUNS_DIR } from '../verification/runLock';

/** How every store names a trail's files (`safe` in each of them). */
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

/** The names in `dir`, none when there is no such folder. */
function namesIn(dir: string): string[] {
  try {
    return readdirSync(dir).filter((n) => !n.startsWith('.'));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return [];
    throw e;
  }
}

/** The local-only files named after a trail alone: `<dir>/<trail><ext>`. */
const SINGLE: [string, string][] = [
  [JOURNAL_DIR, '.jsonl'],
  [`${AGENTS_DIR}/charted`, '.json'],
  [`${AGENTS_DIR}/criteria-proposals`, '.json'],
];
/** The local-only folders of a trail: `<dir>/<trail>/…`. */
const FOLDERS = [EVIDENCE_DIR, REROUTES_DIR];
/** The local-only files of a trail's tickets: `<dir>/<trail>--<ticket>.json`. */
const PER_TICKET = [`${AGENTS_DIR}/leases`, `${AGENTS_DIR}/workspaces`, RUNS_DIR];

/**
 * Whether this repo keeps local-only state under the trail id `mapId`: its journal, evidence, reroutes, which agent
 * charted it, criteria proposals, leases, workspaces or check runs. A trail folder deleted by hand leaves all of
 * that behind as history; a new trail under the same name would take it over, so the name stays taken (the state is
 * never moved or deleted).
 */
export function holdsTrailState(root: string, mapId: string): boolean {
  const id = safe(mapId);
  if (SINGLE.some(([dir, ext]) => existsSync(path.join(root, dir, `${id}${ext}`)))) return true;
  if (FOLDERS.some((dir) => namesIn(path.join(root, dir, id)).length > 0)) return true;
  return PER_TICKET.some((dir) => namesIn(path.join(root, dir)).some((n) => n.startsWith(`${id}--`)));
}
