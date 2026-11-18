import type { Scorecard } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

async function fetchScorecard(): Promise<Scorecard | null> {
  const r = await fetch(`${apiBase()}/scorecard`);
  return r.ok ? ((await r.json()) as Scorecard) : null;
}

/** The agent scorecard on this repo, fresh after completions and reviews. undefined while loading, null without a server. */
export function useScorecard() {
  const [card, setCard] = useState<Scorecard | null>();
  useLiveLoad({
    load: fetchScorecard,
    show: setCard,
    failed: () => setCard(null),
    // a running session's model and spend count too; a busy agent writes its doc often
    events: { verification: () => true, agent: () => true },
    throttleMs: 5000,
    changed: (p) => p.includes('/tickets/'),
  });
  return card;
}
