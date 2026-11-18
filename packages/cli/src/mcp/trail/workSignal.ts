import { watchWorkChanges } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/** A write often touches several files (a ticket and its criteria, a file and its approval): let them all land. */
const SETTLE_MS = 150;

/** Why a wait for a change ended: what changed, or nothing (the re-check timer, or the call was cancelled). */
export type WorkWake = { kind: 'changed'; what: string } | { kind: 'recheck' } | { kind: 'cancelled' };

/**
 * Changes that can let work be claimed for one agent, as they happen: the tracker folder and this machine's
 * approvals of it (watchWorkChanges), and the agent's own tracker's events (a GitHub or Linear tracker polls).
 * A change that lands while nobody is waiting is kept for the next `next`, so nothing between two re-checks is lost.
 */
export function workSignal(ctx: AgentContext) {
  let pending: string | undefined;
  let wake: (() => void) | undefined;
  const changed = (what: string) => {
    pending ??= what;
    wake?.();
  };
  const offFiles = watchWorkChanges(ctx.root, changed);
  const offTracker = ctx.adapter.subscribe(() => changed('a ticket changed'));

  /** Resolves on the next change (after it settles), after `ms` without one, or when `signal` aborts. */
  function next(ms: number, signal?: AbortSignal): Promise<WorkWake> {
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout>;
      let settling = false;
      const finish = (w: WorkWake) => {
        clearTimeout(timer);
        wake = undefined;
        signal?.removeEventListener('abort', onAbort);
        resolve(w);
      };
      const onAbort = () => finish({ kind: 'cancelled' });
      // the first change starts the settle time; later ones ride along, so a busy folder can't put it off
      const settle = () => {
        if (settling) return;
        settling = true;
        clearTimeout(timer);
        timer = setTimeout(() => {
          const what = pending ?? 'something changed';
          pending = undefined;
          finish({ kind: 'changed', what });
        }, SETTLE_MS);
      };
      if (signal?.aborted) return finish({ kind: 'cancelled' });
      signal?.addEventListener('abort', onAbort, { once: true });
      wake = settle;
      if (pending) return settle();
      timer = setTimeout(() => finish({ kind: 'recheck' }), ms);
    });
  }

  return {
    next,
    close() {
      offFiles();
      offTracker();
      wake = undefined;
    },
  };
}
