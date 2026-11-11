import { adoptableWithoutFile } from './adoptableWithoutFile';
import { committedFiles } from './committedFiles';
import type { TrustItem } from './trustItem';

/**
 * The items with `committed` set: true for those whose file is in git's HEAD as it is now; for those with no file,
 * only a level at least the approved default (adoptableWithoutFile.ts).
 */
export async function withCommitted(root: string, items: TrustItem[]): Promise<TrustItem[]> {
  const state = await gitState(root, items);
  return items.map((i) => ({ ...i, committed: isCommitted(root, i, state) }));
}

/** What git says about the items' files: which are committed as they are. */
export async function gitState(root: string, items: Pick<TrustItem, 'file'>[]) {
  const files = [...new Set(items.flatMap((i) => (i.file ? [i.file] : [])))];
  return { committed: await committedFiles(root, files) };
}

/** An item counts as committed when its file is; with no file, see adoptableWithoutFile. */
export function isCommitted(root: string, i: TrustItem, s: { committed?: Set<string> }) {
  return i.file ? !!s.committed?.has(i.file) : adoptableWithoutFile(root, i);
}
