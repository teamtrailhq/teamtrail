/** One changed item as a tracker lists it: a stable key (issue or comment id) and when it last changed (ISO). */
export interface Stamped {
  key: string;
  at: string;
}

/**
 * The poll window of a tracker's change list. Trackers stamp changes to the second (GitHub) or the millisecond
 * (Linear), so a strict "newer than the last one seen" misses a change made in the same tick as it. The window asks
 * for everything at or after the cursor instead (`since` / `gte`) and leaves out only what it already saw at exactly
 * the cursor, so nothing is missed and nothing reported twice.
 */
export class ChangeWindow {
  private cursor?: string;
  /** Keys already reported with a stamp equal to the cursor. */
  private atCursor = new Set<string>();

  /** The stamp to ask from (inclusive); undefined before the first baseline. */
  get since() {
    return this.cursor;
  }

  /** Sets the baseline without reporting anything (the first poll, which resyncs everything anyway). */
  start(cursor: string, items: Stamped[] = []) {
    this.cursor = cursor;
    this.atCursor = new Set(items.filter((i) => i.at === cursor).map((i) => i.key));
  }

  /** The items not reported before, and moves the cursor to the newest stamp seen. */
  take(items: Stamped[]): Stamped[] {
    const since = this.cursor ?? '';
    const fresh = items.filter((i) => i.at > since || (i.at === since && !this.atCursor.has(i.key)));
    const newest = items.reduce((m, i) => (i.at > m ? i.at : m), since);
    if (newest !== since) this.atCursor = new Set();
    for (const i of items) if (i.at === newest) this.atCursor.add(i.key);
    this.cursor = newest;
    return fresh;
  }
}
