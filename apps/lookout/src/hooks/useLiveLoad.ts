import { useCallback, useEffect, useRef } from 'react';
import { type LiveLoader, type LiveLoadSpec, liveLoad } from '../lib/liveLoad';

export interface UseLiveLoad<T> extends LiveLoadSpec<T> {
  /** Which view this is (a trail's id, a ticket's): another one starts over, and loads of the old one never land. */
  view?: string;
  /** Loads again when it changes (the trail's tickets moved), without starting over. */
  version?: unknown;
}

/**
 * A view kept live on the shared event stream (lib/liveLoad.ts): loaded at mount, when `view` or `version` change,
 * when its files or events say so and each time the stream opens; overlapping loads land in the order they started.
 * The spec is read as it is at each call, so its functions need no memoizing. `reload` and `pushed` are stable.
 */
export function useLiveLoad<T>(spec: UseLiveLoad<T>) {
  const latest = useRef(spec);
  latest.current = spec;
  const loader = useRef<LiveLoader>();
  const loadedVersion = useRef(spec.version);
  const { view, version } = spec;

  useEffect(() => {
    const now = latest.current;
    loadedVersion.current = now.version;
    const names = Object.keys(now.events ?? {});
    const l = liveLoad<T>({
      load: () => latest.current.load(),
      show: (value) => latest.current.show(value),
      failed: () => latest.current.failed?.(),
      ...(now.changed ? { changed: (path: string) => latest.current.changed?.(path) === true } : {}),
      events: Object.fromEntries(names.map((n) => [n, (data: unknown) => latest.current.events?.[n]?.(data) === true])),
    });
    loader.current = l;
    return () => {
      l.stop();
      loader.current = undefined;
    };
  }, [view]);

  useEffect(() => {
    if (Object.is(loadedVersion.current, version)) return;
    loadedVersion.current = version;
    loader.current?.reload();
  }, [version]);

  const reload = useCallback(() => loader.current?.reload(), []);
  const pushed = useCallback(() => loader.current?.pushed(), []);
  return { reload, pushed };
}
