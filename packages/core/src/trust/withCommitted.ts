import { adoptableWithoutFile } from './adoptableWithoutFile';
import { absentFromHead, committedFiles } from './committedFiles';
import type { TrustItem } from './trustItem';

/**
 * The items with `committed` set: true for those whose file is in git's HEAD as it is now; for those with no file,
 * only a level at least the approved default (adoptableWithoutFile.ts).
 */
export async function withCommitted(root: string, items: TrustItem[]): Promise<TrustItem[]> {
  const state = await gitState(root, items);
  return items.map((i) => ({ ...i, committed: isCommitted(root, i, state) }));
}

/** What git says about the items' files: which are committed as they are, which were never committed. */
export async function gitState(root: string, items: Pick<TrustItem, 'file' | 'absentFile'>[]) {
  const files = [...new Set(items.flatMap((i) => (i.file ? [i.file] : [])))];
  const absent = [...new Set(items.flatMap((i) => (i.absentFile ? [i.absentFile] : [])))];
  return { committed: await committedFiles(root, files), absent: await absentFromHead(root, absent) };
}

/** An item counts as committed: its file is, and the file it needs absent never was; no file, see adoptableWithoutFile. */
export function isCommitted(root: string, i: TrustItem, s: { committed?: Set<string>; absent?: Set<string> }) {
  if (!i.file) return adoptableWithoutFile(root, i);
  if (i.absentFile && !s.absent?.has(i.absentFile)) return false;
  return !!s.committed?.has(i.file);
}
