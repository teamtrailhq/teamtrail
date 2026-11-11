import type { TrustItem } from './trustItem';

/** The files an item comes from: its one file, or its several (a trail's files nobody signed); none for a level. */
export const itemFiles = (i: Pick<TrustItem, 'file' | 'files'>): string[] => i.files ?? (i.file ? [i.file] : []);
