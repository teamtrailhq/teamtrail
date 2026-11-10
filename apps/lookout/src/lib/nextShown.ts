/** The version of an item the human opened (`hash`) and the one the server has now (`latest`). */
export interface Shown {
  hash?: string;
  latest?: string;
}

/**
 * What an approval binds to after a refetch: the version the human opened stays, however often the item is
 * refetched; a different `latest` only marks it changed until they review it again. Before the first load there is
 * nothing opened yet, so the first version is it.
 */
export function nextShown(prev: Shown | undefined, latest?: string): Shown {
  if (prev?.hash === undefined) return { hash: latest, latest };
  if (prev.latest === latest) return prev;
  return { hash: prev.hash, latest };
}
