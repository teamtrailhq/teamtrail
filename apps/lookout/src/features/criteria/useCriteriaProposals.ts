import type { Criterion } from '@teamtrail/core';
import { useCallback, useEffect, useState } from 'react';
import { apiBase } from '../../lib/apiBase';
import { onTrackerChange } from '../../lib/trackerChanges';

/** A change an agent proposed to criteria the trail lead confirmed (core criteria/criteriaProposals.ts). */
export interface CriteriaProposalView {
  ticketId: string;
  ticketKey: string;
  criteria: Criterion[];
  by: string;
  at: number;
  /** The hash of the criteria as shown: taking the proposal names it, so one swapped meanwhile isn't taken. */
  hash?: string;
}

const api = `${apiBase()}/criteria-proposals`;

/** A trail's proposed criteria changes, live; `decide` takes one (accept) or drops it (dismiss). */
export function useCriteriaProposals(mapId?: string) {
  const [proposals, setProposals] = useState<CriteriaProposalView[]>([]);
  const load = useCallback(() => {
    if (!mapId) return setProposals([]);
    void fetch(`${api}?mapId=${encodeURIComponent(mapId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ proposals: CriteriaProposalView[] }>) : { proposals: [] }))
      .then((b) => setProposals(b.proposals))
      .catch(() => setProposals([]));
  }, [mapId]);
  useEffect(() => {
    load();
    return onTrackerChange((path) => path.startsWith('criteria/') && load());
  }, [load]);
  const decide = (action: 'accept' | 'dismiss', body: { title: string; ticketId: string; hash?: string }) =>
    fetch(`${api}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, ...body }),
    }).then(load);
  return { proposals, decide };
}
