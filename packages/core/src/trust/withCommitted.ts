import { adoptableWithoutFile } from './adoptableWithoutFile';
import { committedFiles } from './committedFiles';
import { itemFiles } from './itemFiles';
import type { TrustItem } from './trustItem';

/**
 * The items with `committed` set: true for those whose files are all in git's HEAD as they are now; for those with no file,
 * only a level at least the approved default (adoptableWithoutFile.ts).
 */
export async function withCommitted(root: string, items: TrustItem[]): Promise<TrustItem[]> {
  const files = [...new Set(items.flatMap(itemFiles))];
  const committed = await committedFiles(root, files);
  return items.map((i) => {
    const own = itemFiles(i);
    return { ...i, committed: own.length ? own.every((f) => committed.has(f)) : adoptableWithoutFile(root, i) };
  });
}
