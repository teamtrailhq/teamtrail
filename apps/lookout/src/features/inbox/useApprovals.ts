import type { ApprovalItem, MapSnapshot } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { prSync } from '../../lib';
import { verificationApi } from '../../lib/verification';

/** Tickets waiting on the trail lead, reloaded when evidence changes, a ticket moves or the event stream opens. */
export function useApprovals(snaps: Record<string, MapSnapshot>): ApprovalItem[] {
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const moved = Object.values(snaps)
    .map((s) => s.tickets.map((t) => `${t.id}:${t.state}:${t.status ?? ''}`).join())
    .join('|');
  const { reload } = useLiveLoad({ version: moved, load: verificationApi.inbox, show: setItems });
  useEffect(() => prSync.onEvidence(reload), [reload]);
  return items;
}
