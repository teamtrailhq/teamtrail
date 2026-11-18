/**
 * What one reconciler loop remembers between ticks, in memory only (watchVerification.ts keeps one per loop), so a
 * project's GitHub calls don't grow with its history: when each branch was last looked up, and when each settled
 * pull request (merged or closed) was last read. Without one, every tick reads everything, as a fresh start does.
 */
export interface ReconcileMemo {
  branchAt: Map<string, number>;
  readAt: Map<number, number>;
}

/** How long a branch lookup or a settled PR's read stands before it is made again. */
export const MEMO_MS = 60 * 60_000;

export const reconcileMemo = (): ReconcileMemo => ({ branchAt: new Map(), readAt: new Map() });

/** Whether `at` (a lookup's time in the memo) is still fresh at `now`. */
export const recent = (at: number | undefined, now: number) => at !== undefined && now - at < MEMO_MS;
