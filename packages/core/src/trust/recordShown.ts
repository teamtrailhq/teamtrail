import type { TrustItem } from './trustItem';
import { trustLedger } from './trustLedger';

/**
 * Records the trail lead's approval of `item` as it was shown: its content and that content's hash, never the file
 * as it is by now. If the file changed between the page and the click, the record doesn't match it, so the gate stays
 * closed and the item shows as changed again, to be reviewed once more.
 */
export function recordShown(input: { root: string; item: Pick<TrustItem, 'key' | 'hash' | 'content'>; by: string }) {
  const { root, item, by } = input;
  trustLedger(root).set({ [item.key]: { hash: item.hash, at: Date.now(), by, content: item.content } });
}
