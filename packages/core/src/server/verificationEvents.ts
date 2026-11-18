import { EVIDENCE_DIR } from '../verification/evidenceStore';
import { RUNS_DIR } from '../verification/runLock';

/** Coalesces bursts (a check log streaming, an attempt and its logs landing together) into one event per ticket. */
const QUIET_MS = 300;

/** SSE `verification` event (`kind: 'evidence'`): something under a ticket's evidence or run lock changed. */
export interface VerificationEvidenceEvent {
  kind: 'evidence';
  mapId: string;
  ticketId: string;
  /**
   * The ticket's PR snapshot (`sync.json`) was among what changed: written or dropped by whoever keeps it (the
   * reconciler, or an embedding server that merges pull requests), so the Lookout reads the snapshots again.
   */
  sync?: true;
}

/** A ticket's PR snapshot, or the temp file it is written through (syncStore.ts). */
const SYNC_PATH = /^[^/]+\/[^/]+\/[^/]+\/sync\.json(\.\d+\.tmp)?$/;

function ticketOf(rel: string): VerificationEvidenceEvent | undefined {
  if (rel.startsWith(`${EVIDENCE_DIR}/`)) {
    const [, mapId, ticketId] = rel.split('/');
    return mapId && ticketId ? { kind: 'evidence', mapId, ticketId } : undefined;
  }
  if (rel.startsWith(`${RUNS_DIR}/`)) {
    const m = rel.slice(RUNS_DIR.length + 1).match(/^(.+)--(.+)\.json$/);
    return m ? { kind: 'evidence', mapId: m[1], ticketId: m[2] } : undefined;
  }
  return undefined;
}

/**
 * Turns changed paths under `.evidence/` and `.agents/runs/` into named
 * `verification` SSE events. The returned function says whether it took the path.
 * Ids are the file-safe forms used in those paths.
 */
export function verificationEvents(send: (text: string) => void) {
  const pending = new Map<string, { ev: VerificationEvidenceEvent; timer: ReturnType<typeof setTimeout> }>();
  const notify = (rel: string) => {
    if (rel !== EVIDENCE_DIR && !rel.startsWith(`${EVIDENCE_DIR}/`) && !rel.startsWith(`${RUNS_DIR}/`)) return false;
    const found = ticketOf(rel);
    if (!found) return true;
    const key = `${found.mapId}/${found.ticketId}`;
    const sync = SYNC_PATH.test(rel);
    const waiting = pending.get(key);
    if (waiting) {
      if (sync) waiting.ev.sync = true;
      return true;
    }
    const ev: VerificationEvidenceEvent = sync ? { ...found, sync: true } : found;
    const timer = setTimeout(() => {
      pending.delete(key);
      send(`event: verification\ndata: ${JSON.stringify(ev)}\n\n`);
    }, QUIET_MS);
    timer.unref?.();
    pending.set(key, { ev, timer });
    return true;
  };
  notify.close = () => {
    for (const p of pending.values()) clearTimeout(p.timer);
    pending.clear();
  };
  return notify;
}
