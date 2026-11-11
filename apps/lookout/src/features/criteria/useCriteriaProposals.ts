import type { Criterion } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';
import { responseError } from '../../lib/responseError';

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

async function fetchProposals(mapId?: string): Promise<CriteriaProposalView[]> {
  if (!mapId) return [];
  const r = await fetch(`${api}?mapId=${encodeURIComponent(mapId)}`);
  return r.ok ? ((await r.json()) as { proposals: CriteriaProposalView[] }).proposals : [];
}

/** A trail's proposed criteria changes, live; `decide` takes one (accept) or drops it (dismiss). */
export function useCriteriaProposals(mapId?: string) {
  const [proposals, setProposals] = useState<CriteriaProposalView[]>([]);
  const { reload } = useLiveLoad({
    view: mapId,
    load: () => fetchProposals(mapId),
    show: setProposals,
    failed: () => setProposals([]),
    // Proposals live in `.agents/` (local only), which the watcher reports as its own event.
    events: { 'criteria-proposals': (data) => (data as { mapId?: string } | undefined)?.mapId === mapId },
  });
  const decide = (action: 'accept' | 'dismiss', body: { title: string; ticketId: string; hash?: string }) =>
    fetch(`${api}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, ...body }),
    })
      .catch(() => undefined)
      .then(async (r) => {
        const error = await responseError(r);
        reload();
        return error;
      });
  return { proposals, decide };
}
