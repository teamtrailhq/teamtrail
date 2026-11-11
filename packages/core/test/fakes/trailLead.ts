import { approveTrust } from '../../src/trust/approveTrust';
import { pendingTrust } from '../../src/trust/pendingTrust';

/**
 * The trail lead pressing "Approve all" in Settings → Approvals on this machine: everything the project's files
 * ask to trust (check commands, accepted briefs, confirmed criteria and knowledge, a lowered policy) as it is now.
 * Fixtures that write those files directly stand in for a human who wrote and approved them.
 */
export function approveAllHere(root: string) {
  // one at a time, as Approve on each row: approving several at once only adopts committed content
  const items = pendingTrust(root).map((i) => ({ key: i.key, hash: i.hash }));
  return items.map((item) => approveTrust({ root, items: [item], by: 'trail lead' }));
}
