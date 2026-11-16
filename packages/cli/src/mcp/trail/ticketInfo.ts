import type { DecisionRecord, MapSnapshot, Ticket } from '@teamtrail/core';
import { guideView } from './guides';
import { verificationView } from './verificationView';
import { ticketView } from './views';

/** A ticket as tools return it: the view, its guides, plus the checks its completion needs and any rework feedback. */
export const ticketInfo = (root: string, snap: MapSnapshot, t: Ticket, records: DecisionRecord[] = []) => ({
  ...ticketView(snap, t, records),
  ...guideView(root, snap, t),
  ...verificationView(root, snap, t),
});
