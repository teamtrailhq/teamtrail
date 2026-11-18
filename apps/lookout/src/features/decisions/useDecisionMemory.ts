import type { DecisionMemoryEntry } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

export type DecisionMemory = Record<string, DecisionMemoryEntry>;

async function fetchMemory(): Promise<DecisionMemory | null> {
  const r = await fetch(`${apiBase()}/decision-memory`);
  return r.ok ? ((await r.json()) as { entries: DecisionMemory }).entries : null;
}

/** Each decision's area and who cites it, keyed `<mapId>/<id>`; fresh when decisions change. null without a server. */
export function useDecisionMemory() {
  const [memory, setMemory] = useState<DecisionMemory | null>();
  useLiveLoad({
    load: fetchMemory,
    show: setMemory,
    failed: () => setMemory(null),
    changed: (p) => p.includes('/decisions/') || p.endsWith('map.md'),
    // a decision's area is what its ticket's latest passing attempt changed; GitHub and Linear trails have no
    // files, so the server says when one changed
    events: {
      verification: (data) => (data as { kind?: unknown } | undefined)?.kind === 'evidence',
      tracker: () => true,
    },
    throttleMs: 2000,
  });
  return memory;
}
