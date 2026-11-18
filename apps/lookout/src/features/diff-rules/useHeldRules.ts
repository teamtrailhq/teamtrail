import type { HeldRules } from '@teamtrail/core';
import { useState } from 'react';
import { useLiveLoad } from '../../hooks/useLiveLoad';
import { apiBase } from '../../lib/apiBase';

/** The rules a ticket's latest completion was refused for, or undefined; `reload` after acting on one. */
export function useHeldRules(mapId: string, ticketId: string) {
  const [held, setHeld] = useState<HeldRules>();
  const load = async () => {
    const q = new URLSearchParams({ mapId, ticketId });
    const r = await fetch(`${apiBase()}/verification/rules/held?${q}`);
    return r.ok ? ((await r.json()) as { held?: HeldRules }).held : undefined;
  };
  const live = useLiveLoad({
    view: `${mapId}/${ticketId}`,
    load,
    show: setHeld,
    events: { verification: () => true, leases: () => true, attention: () => true },
  });
  return { held, reload: live.reload };
}
