import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

async function fetchLastMatched(): Promise<Record<string, number>> {
  const r = await fetch(`${apiBase()}/verification/rules`);
  if (!r.ok) return {};
  return ((await r.json()) as { lastMatched?: Record<string, number> }).lastMatched ?? {};
}

/** When each diff rule last matched a completion, by rule id; fresh as completions are verified. */
export function useRulesLastMatched() {
  const [last, setLast] = useState<Record<string, number>>({});
  useLiveLoad({ load: fetchLastMatched, show: setLast, events: { verification: () => true } });
  return last;
}
