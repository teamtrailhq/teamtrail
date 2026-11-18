import type { HeldRules } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';
import type { WaivedRule } from './types';

type Loaded = { held?: HeldRules; waived: WaivedRule[] };

/**
 * The rules a ticket's latest completion was refused for (or undefined), and the rules the trail lead let it go
 * without; `reload` after acting on one.
 */
export function useHeldRules(mapId: string, ticketId: string) {
  const [loaded, setLoaded] = useState<Loaded>({ waived: [] });
  const load = async (): Promise<Loaded> => {
    const q = new URLSearchParams({ mapId, ticketId });
    const r = await fetch(`${apiBase()}/verification/rules/held?${q}`);
    if (!r.ok) return { waived: [] };
    const body = (await r.json()) as Partial<Loaded>;
    return { held: body.held, waived: body.waived ?? [] };
  };
  const live = useLiveLoad({
    view: `${mapId}/${ticketId}`,
    load,
    show: setLoaded,
    events: { verification: () => true, leases: () => true, attention: () => true },
  });
  return { ...loaded, reload: live.reload };
}
