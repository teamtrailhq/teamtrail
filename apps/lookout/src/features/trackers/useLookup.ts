import { useCallback, useEffect, useState } from 'react';

/**
 * One tracker lookup (repos, teams, projects): undefined while it loads or when `enabled` is off, then the answer,
 * or `failed(message)` when the request itself failed. `retry` asks again and shows loading meanwhile.
 * `key` names what is asked; a new key drops the old answer so a stale list never shows.
 */
export function useLookup<T>(o: {
  enabled: boolean;
  key: string;
  load: () => Promise<T>;
  failed: (message: string) => T;
}) {
  const [value, setValue] = useState<T>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setValue(undefined);
    if (!o.enabled) return;
    let live = true;
    o.load().then(
      (v) => live && setValue(v),
      (e: Error) => live && setValue(o.failed(e.message)),
    );
    return () => {
      live = false;
    };
    // `load` and `failed` are fresh closures each render; `key` says when the question changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.enabled, o.key, attempt]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { value, retry };
}
