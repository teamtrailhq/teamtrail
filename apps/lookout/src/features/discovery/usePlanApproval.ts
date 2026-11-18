import { DISCOVERY_TYPES, type DiscoveryBrief, type MapSnapshot } from '@teamtrail/core';
import { useState } from 'react';
import { useShown } from '../../hooks/useShown';
import { apiBase } from '../../lib/apiBase';
import { responseError } from '../../lib/responseError';
import { useCriteria } from '../criteria';

/**
 * Approve the plan in one step: the submitted brief and every implementation ticket's acceptance criteria not yet
 * confirmed here, each bound to the hash of what the page shows (`POST /plan/approve`, all or nothing on the server).
 * Offered once the brief waits for review and some ticket carries criteria. Bound to the version on screen: a brief or
 * criteria rewritten while the human reads wait for "Review again".
 */
export function usePlanApproval(input: { snap?: MapSnapshot; brief: DiscoveryBrief | null; hash?: string }) {
  const { snap, brief, hash } = input;
  const mapId = snap?.map.id;
  const { tickets: all } = useCriteria(mapId);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const open = new Map(
    (snap?.tickets ?? []).filter((t) => t.state === 'open' && !DISCOVERY_TYPES.includes(t.type)).map((t) => [t.id, t]),
  );
  const tickets = all
    .filter((c) => open.has(c.ticketId) && c.criteria.length > 0 && !c.confirmed && c.hash)
    .map((c) => ({ ...c, title: open.get(c.ticketId)!.title, key: open.get(c.ticketId)!.key }));
  const covered = new Set(all.filter((c) => c.criteria.length > 0).map((c) => c.ticketId));
  const without = [...open.values()].filter((t) => !covered.has(t.id));
  const available = brief?.status === 'submitted' && !!hash && tickets.length > 0;
  const shown = useShown(available ? mapId : undefined, [hash, ...tickets.map((t) => t.hash)].join(','));
  const approve = async () => {
    if (!available || !snap || shown.changed) return false;
    setBusy(true);
    const r = await fetch(`${apiBase()}/plan/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mapId,
        title: snap.map.title,
        brief: hash,
        criteria: tickets.map((t) => ({ ticketId: t.ticketId, ticketKey: t.key, hash: t.hash })),
      }),
    }).catch(() => undefined);
    const failed = await responseError(r);
    setBusy(false);
    setError(failed);
    return !failed;
  };
  return {
    available,
    brief,
    tickets,
    /** Implementation tickets with no criteria yet: their agent writes them before it starts. */
    without,
    changed: shown.changed,
    reviewAgain: shown.reviewAgain,
    error,
    busy,
    approve,
  };
}

export type PlanApprovalApi = ReturnType<typeof usePlanApproval>;
