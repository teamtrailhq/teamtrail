import type { MapSnapshot } from '../model/types';
import { approveTrust } from './approveTrust';
import { pendingTrust } from './pendingTrust';
import { gitState } from './withCommitted';

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
  const state = await gitState(input.root, pendingTrust(input.root, input.snaps));
  return approveTrust({ ...input, ...state });
}
