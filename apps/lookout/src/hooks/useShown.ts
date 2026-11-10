import { useState } from 'react';
import { nextShown, type Shown } from '../lib/nextShown';

/**
 * Binds an approval to the version of an item the human opened (`key`: the item; `latest`: the hash the server
 * gave last). `hash` is what the approval sends; `changed` says the item moved on since, and `reviewAgain` takes the
 * new version once the human has read it. Opening another item starts over.
 */
export function useShown(key: string | undefined, latest: string | undefined) {
  const [state, setState] = useState<{ key?: string; shown: Shown }>({ key, shown: nextShown(undefined, latest) });
  let current = state;
  if (state.key !== key) current = { key, shown: nextShown(undefined, latest) };
  else if (state.shown.latest !== latest) current = { key, shown: nextShown(state.shown, latest) };
  if (current !== state) setState(current);
  return {
    hash: current.shown.hash,
    changed: current.shown.hash !== current.shown.latest,
    reviewAgain: () => setState({ key, shown: nextShown(undefined, latest) }),
  };
}
