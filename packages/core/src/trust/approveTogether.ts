import type { MapSnapshot } from '../model/types';
import { approveTrust } from './approveTrust';
import { committedFiles } from './committedFiles';
import { itemFiles } from './itemFiles';
import { pendingTrust } from './pendingTrust';

/**
 * Approves the items the page showed, with which of their files are committed (asked of git first, which is
 * asynchronous): what `approveTrust` needs to adopt several at once on the first run. One item needs no git.
 */
export async function approveTogether(input: {
  root: string;
  items: { key: string; hash: string }[];
  by: string;
  snaps?: MapSnapshot[];
}) {
  if (input.items.length < 2) return approveTrust(input);
  const files = pendingTrust(input.root, input.snaps).flatMap(itemFiles);
  return approveTrust({ ...input, committed: await committedFiles(input.root, [...new Set(files)]) });
}
