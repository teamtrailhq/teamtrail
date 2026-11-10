import { committedFiles } from './committedFiles';
import type { TrustItem } from './trustItem';

/** The items with `committed` set: true for those whose file is in git's HEAD as it is now, or that aren't files. */
export function withCommitted(root: string, items: TrustItem[]): TrustItem[] {
  const files = [...new Set(items.flatMap((i) => (i.file ? [i.file] : [])))];
  const committed = committedFiles(root, files);
  return items.map((i) => ({ ...i, committed: i.file ? committed.has(i.file) : true }));
}
