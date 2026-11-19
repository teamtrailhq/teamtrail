import type { PrChoice } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { loadPrChoices } from '../../lib';

export type PrChoicesState =
  { kind: 'loading' } | { kind: 'ready'; repo: string; prs: PrChoice[] } | { kind: 'failed'; error: string };

/** The pull requests a ticket can be linked to, read once when the picker opens (with this machine's token). */
export function usePrChoices(mapId: string, ticketId: string): PrChoicesState {
  const [state, setState] = useState<{ key: string; value: PrChoicesState }>();
  const key = `${mapId}/${ticketId}`;
  useEffect(() => {
    let live = true;
    void loadPrChoices({ mapId, ticketId }).then((r) => {
      if (!live) return;
      setState({ key, value: 'error' in r ? { kind: 'failed', error: r.error } : { kind: 'ready', ...r } });
    });
    return () => void (live = false);
  }, [mapId, ticketId, key]);
  return state?.key === key ? state.value : { kind: 'loading' };
}
