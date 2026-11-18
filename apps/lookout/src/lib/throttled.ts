/**
 * `fn` at most once per `ms`: the first call runs at once, calls within the window run once at its end. Without
 * `ms`, every call runs. `cancel` drops a waiting call.
 */
export function throttled(fn: () => void, ms?: number) {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = () => {
    timer = undefined;
    last = Date.now();
    fn();
  };
  const call = () => {
    if (!ms) return fn();
    if (timer) return;
    const wait = last + ms - Date.now();
    if (wait <= 0) return run();
    timer = setTimeout(run, wait);
  };
  call.cancel = () => clearTimeout(timer);
  return call;
}
