import { adoptableWithoutFile } from './adoptableWithoutFile';
import { committedFiles } from './committedFiles';
import { itemFiles } from './itemFiles';
import type { TrustItem } from './trustItem';

/**
 * The items with `committed` set: true for those whose files are all in git's HEAD as they are now; for those with no file,
 * only a level at least the approved default (adoptableWithoutFile.ts).
 */
export async function withCommitted(root: string, items: TrustItem[]): Promise<TrustItem[]> {
  const state = await gitState(root, items);
  return items.map((i) => ({ ...i, committed: isCommitted(root, i, state) }));
}

/** What git says about the items' files: which are committed as they are. */
export async function gitState(root: string, items: Pick<TrustItem, 'file' | 'files'>[]) {
  const files = [...new Set(items.flatMap(itemFiles))];
  return { committed: await committedFiles(root, files) };
}

/** An item counts as committed when all its files are; with none, see adoptableWithoutFile. */
export function isCommitted(root: string, i: TrustItem, s: { committed?: Set<string> }) {
  const files = itemFiles(i);
  return files.length ? files.every((f) => !!s.committed?.has(f)) : adoptableWithoutFile(root, i);
}
