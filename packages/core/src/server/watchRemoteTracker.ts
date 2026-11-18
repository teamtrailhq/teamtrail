import type { TrackerAdapter } from '../adapters/adapter';

/** How often the active tracker is looked up again (another one connected, a new token or repo). */
const CHECK_MS = 3000;
/** Bursts of tracker events (one write emits several) become one message. */
const QUIET_MS = 250;

const isRemote = (a: TrackerAdapter) => a.kind === 'github' || a.kind === 'linear';

/**
 * Sends a named `tracker` SSE event when a GitHub or Linear trail changes, by this process or in the tracker, so
 * views that read through the bridge (decision memory, proofs, the scorecard) load again: with markdown they follow
 * the changed files, and remote trails have none. Subscribing also keeps the adapter polling with free 304s while
 * the Lookout runs, instead of reading every trail again whenever its cache expires. Returns the stop function.
 */
export function watchRemoteTracker(o: { active: () => Promise<TrackerAdapter>; send: (text: string) => void }) {
  const { active, send } = o;
  let current: TrackerAdapter | undefined;
  let off = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      send('event: tracker\ndata: {}\n\n');
    }, QUIET_MS);
    timer.unref?.();
  };
  const follow = async () => {
    const a = await active().catch(() => undefined);
    if (!a || a === current) return;
    off();
    current = a;
    off = isRemote(a) ? a.subscribe(changed) : () => {};
  };
  void follow();
  const check = setInterval(() => void follow(), CHECK_MS);
  check.unref?.();
  return () => {
    clearInterval(check);
    clearTimeout(timer);
    off();
  };
}
