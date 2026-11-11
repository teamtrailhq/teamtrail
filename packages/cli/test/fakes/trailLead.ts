import {
  approveTrust,
  confirmCriteriaHere,
  criteriaContent,
  pendingTrust,
  readCriteriaFile,
} from '@teamtrail/core/agents';

/**
 * The trail lead pressing "Approve all" in Settings → Approvals on this machine: everything the project's files
 * ask to trust (check commands, accepted briefs, confirmed criteria and knowledge, a lowered policy) as it is now.
 * Tests that write those files directly stand in for a human who wrote and approved them.
 */
export function approveAllHere(root: string) {
  // one at a time, as Approve on each row: approving several at once only adopts committed content
  const items = pendingTrust(root).map((i) => ({ key: i.key, hash: i.hash }));
  return items.map((item) => approveTrust({ root, items: [item], by: 'trail lead' }));
}

/** The trail lead confirming a ticket's criteria in the Lookout on this machine, as the file has them now. */
export function confirmCriteriaHereNow(root: string, mapId: string, ticketId: string) {
  const t = readCriteriaFile(root, mapId).find((x) => x.ticketId === ticketId);
  if (t) confirmCriteriaHere(root, { mapId, ticketId, content: criteriaContent(t) }, 'trail lead');
}
