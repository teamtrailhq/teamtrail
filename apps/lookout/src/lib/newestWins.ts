/**
 * Overlapping loads of the same view, shown in the order they started: a load that lands after a newer one was
 * shown is dropped, however late it lands. Without this, a slow request started before a change can overwrite
 * what the change brought and stay on screen until something else changes. A value the server pushes (an SSE
 * event) counts as newer than every load started before it.
 */
export function newestWins() {
  let started = 0;
  let shown = 0;
  return {
    /**
     * Call as a load starts. Call what it returns once the load has its result: true when the result may be shown
     * (nothing newer was), and it is then the newest shown.
     */
    start(): () => boolean {
      const mine = ++started;
      return () => {
        if (mine <= shown) return false;
        shown = mine;
        return true;
      };
    },
    /** The server pushed the view as it is now: loads already started are older. */
    pushed() {
      shown = ++started;
    },
  };
}
