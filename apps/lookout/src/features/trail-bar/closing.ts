type Fns<T> = { [K in keyof T]: (...args: never[]) => void };

/** Each of `fns` as it is, calling `close` first: what opens something from the drawer also closes it. */
export function closing<T extends Fns<T>>(fns: T, close: () => void): T {
  const out: Partial<Record<keyof T, (...args: never[]) => void>> = {};
  for (const name of Object.keys(fns) as (keyof T)[]) {
    const fn = fns[name];
    out[name] = (...args: never[]) => {
      close();
      fn(...args);
    };
  }
  return out as T;
}
