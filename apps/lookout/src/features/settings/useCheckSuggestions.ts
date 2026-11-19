import type { CheckSuggestion } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';

/**
 * The checks reading the repo suggests (`GET /repo/profile`), each with the folder it runs in. [] until they come,
 * and when there's no checkout to read or the server didn't answer: nothing is suggested then.
 */
export function useCheckSuggestions(): CheckSuggestion[] {
  const [suggestions, setSuggestions] = useState<CheckSuggestion[]>([]);
  useEffect(() => {
    const stop = new AbortController();
    void fetch(`${apiBase()}/repo/profile`, { signal: stop.signal })
      .then((r) => (r.ok ? (r.json() as Promise<{ suggestions?: CheckSuggestion[] }>) : undefined))
      .then((body) => setSuggestions(body?.suggestions ?? []))
      .catch(() => undefined);
    return () => stop.abort();
  }, []);
  return suggestions;
}
