import type { TrackerEvent } from '../../model/types';
import { parseDecision } from '../../planning/decisions/decisionFile';
import { DECISION_PATH } from './paths';

/**
 * Turns watcher hits from other writers into tracker events. An external decision
 * write also touches map.md, and watchers fire more than once per write, so changes
 * are batched per trail; a batch with decision files reports as decision events.
 */
export class ExternalChanges {
  /** Last seen text and supersededBy per decision file, to tell new records from supersessions and drop duplicate watcher hits. */
  private seen = new Map<string, { text: string; supersededBy?: string }>();
  private pending = new Map<string, { paths: Set<string>; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private read: (path: string) => Promise<string>,
    private emit: (e: TrackerEvent) => void,
  ) {}

  knows(path: string) {
    return this.seen.has(path);
  }

  remember(path: string, text: string, supersededBy?: string) {
    this.seen.set(path, { text, supersededBy });
  }

  queue(path: string) {
    const mapId = path.split('/')[0];
    const batch = this.pending.get(mapId) ?? {
      paths: new Set<string>(),
      timer: setTimeout(() => void this.flush(mapId), 250),
    };
    batch.paths.add(path);
    this.pending.set(mapId, batch);
  }

  private async flush(mapId: string) {
    const batch = this.pending.get(mapId);
    this.pending.delete(mapId);
    if (!batch) return;
    const decisionPaths = [...batch.paths].filter((p) => DECISION_PATH.test(p));
    const events: TrackerEvent[] = [];
    // a reworded, reverted or deleted decision has no event of its own: the trail still reads differently
    let edited = false;
    for (const p of decisionPaths) {
      const change = await this.decisionChange(mapId, p);
      if (change === 'edited') edited = true;
      else if (change) events.push(change);
    }
    const otherFiles = decisionPaths.length < batch.paths.size;
    // a decision written from outside also touches map.md: its own event says enough
    if (!events.length && (otherFiles || edited)) events.push({ kind: 'external.changed', mapId, at: Date.now() });
    // superseded events sort after the record that replaced them
    const rank = (e: (typeof events)[number]) => (e.kind === 'decision.recorded' ? 0 : 1);
    events.sort((a, b) => rank(a) - rank(b));
    for (const e of events) this.emit(e);
  }

  /** What one decision file's change is: a new record, a supersession, another edit, or nothing (a duplicate hit). */
  private async decisionChange(mapId: string, p: string): Promise<TrackerEvent | 'edited' | undefined> {
    const text = await this.read(p).catch(() => '');
    const prev = this.seen.get(p);
    if (!text) {
      if (!prev) return undefined;
      this.seen.delete(p);
      return 'edited';
    }
    if (prev?.text === text) return undefined;
    const d = parseDecision(text);
    this.seen.set(p, { text, supersededBy: d.supersededBy });
    const at = Date.now();
    if (!prev) return { kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, external: true, at };
    if (d.supersededBy && d.supersededBy !== prev.supersededBy)
      return { kind: 'decision.superseded', mapId, decisionId: d.id, supersededBy: d.supersededBy, external: true, at };
    return 'edited';
  }
}
