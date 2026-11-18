import type { FlakyChecksView } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

async function fetchFlaky(): Promise<FlakyChecksView | null> {
  const r = await fetch(`${apiBase()}/flaky-checks`);
  return r.ok ? ((await r.json()) as FlakyChecksView) : null;
}

/** The project's flaky checks, fresh after every completion. undefined while loading, null without a server. */
export function useFlakyChecks() {
  const [view, setView] = useState<FlakyChecksView | null>();
  useLiveLoad({
    load: fetchFlaky,
    show: setView,
    failed: () => setView(null),
    events: { verification: () => true, tracker: () => true },
    changed: (p) => p.includes('/tickets/'),
  });
  return view;
}
