import { refusedWrites, type RefusedWrite } from '@teamtrail/core/bridge';

/** One of the agent's own writes the tracker refused for good, as it is told. */
export interface RefusedNotice {
  write: string;
  tracker: string;
  error: string;
}

const TRACKER: Record<RefusedWrite['tracker'], string> = { github: 'GitHub', linear: 'Linear' };

/**
 * Tells one agent connection, once, about its own tracker writes that GitHub or Linear refused for good after they
 * were queued (a claim, a status, a close): kept on this machine (refusedWrites.ts) with the connection that made
 * them, whichever process sent them in the end.
 */
export class RefusedNotices {
  private told = new Set<string>();

  constructor(private readonly o: { root: string; origin: string }) {}

  /** The connection's refused writes it hasn't been told of yet; none when the machine store can't be read. */
  take(): RefusedNotice[] {
    const fresh = refusedWrites(this.o.root)
      .list()
      .filter((r) => r.write.origin === this.o.origin && !this.told.has(`${r.write.id}@${r.at}`));
    for (const r of fresh) this.told.add(`${r.write.id}@${r.at}`);
    return fresh.map((r) => ({ write: r.write.label, tracker: TRACKER[r.tracker], error: r.error }));
  }
}
