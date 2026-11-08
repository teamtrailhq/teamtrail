import type { ProjectEntry } from '../model/project';
import type { TrackerBridge } from '../server/bridgeTypes';

interface Open {
  bridge: TrackerBridge;
  usedAt: number;
  /** Open event streams; a held bridge is never idle. */
  holds: number;
}

export interface ProjectBridgesOptions {
  /** Starts a full bridge (and its loops) for a project. */
  open: (entry: ProjectEntry) => TrackerBridge;
  /** At most this many bridges run at once; opening one more closes the least recently used. */
  max?: number;
  /** A bridge nobody has used or watched for this long is closed. */
  idleMs?: number;
  /** How often idle bridges are looked for; 0 leaves it to `sweep()`. */
  sweepMs?: number;
  now?: () => number;
}

/**
 * Full bridges for the projects someone opened, started lazily and capped. Projects nobody has open get only
 * the summary poll, so ten registered repos don't mean ten sets of reconcilers and lease reapers.
 */
export class ProjectBridges {
  private readonly open = new Map<string, Open>();
  private readonly max: number;
  private readonly idleMs: number;
  private readonly now: () => number;
  private readonly timer?: ReturnType<typeof setInterval>;

  constructor(private readonly opts: ProjectBridgesOptions) {
    this.max = Math.max(1, opts.max ?? 4);
    this.idleMs = opts.idleMs ?? 10 * 60_000;
    this.now = opts.now ?? Date.now;
    const sweepMs = opts.sweepMs ?? 60_000;
    if (sweepMs > 0) {
      this.timer = setInterval(() => this.sweep(), sweepMs);
      this.timer.unref?.();
    }
  }

  /** How many bridges run now. */
  get size() {
    return this.open.size;
  }

  /** The bridge serving this project, if one runs. */
  peek(id: string): TrackerBridge | undefined {
    return this.open.get(id)?.bridge;
  }

  /** The project's bridge, started on first use. */
  get(entry: ProjectEntry): TrackerBridge {
    const cur = this.open.get(entry.id);
    if (cur) {
      cur.usedAt = this.now();
      return cur.bridge;
    }
    while (this.open.size >= this.max) this.evict();
    const bridge = this.opts.open(entry);
    this.open.set(entry.id, { bridge, usedAt: this.now(), holds: 0 });
    return bridge;
  }

  /** Keeps a project's bridge alive while an event stream is open; returns the release. */
  hold(id: string): () => void {
    const cur = this.open.get(id);
    if (!cur) return () => {};
    cur.holds++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      cur.holds = Math.max(0, cur.holds - 1);
      cur.usedAt = this.now();
    };
  }

  /** Closes bridges idle for longer than `idleMs`. */
  sweep() {
    const cutoff = this.now() - this.idleMs;
    for (const [id, o] of this.open) if (o.holds === 0 && o.usedAt <= cutoff) this.closeOne(id);
  }

  /** Closes one project's bridge (removed from the registry, or its folder is gone). */
  drop(id: string) {
    if (this.open.has(id)) this.closeOne(id);
  }

  close() {
    if (this.timer) clearInterval(this.timer);
    for (const id of [...this.open.keys()]) this.closeOne(id);
  }

  /** The least recently used bridge goes first, preferring one nobody is watching. */
  private evict() {
    const all = [...this.open.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt);
    const victim = all.find(([, o]) => o.holds === 0) ?? all[0];
    if (victim) this.closeOne(victim[0]);
  }

  private closeOne(id: string) {
    const o = this.open.get(id);
    this.open.delete(id);
    o?.bridge.close();
  }
}
