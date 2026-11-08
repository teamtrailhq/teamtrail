import type { DecisionRecord, MapSnapshot, Ticket } from '@teamtrail/core';
import { roleView } from './roles';
import { verificationView } from './verificationView';
import { ticketView } from './views';

/** A ticket as tools return it: the view, its role, plus the checks its completion needs and any rework feedback. */
export const ticketInfo = (root: string, snap: MapSnapshot, t: Ticket, records: DecisionRecord[] = []) => ({
  ...ticketView(snap, t, records),
  ...roleView(root, t),
  ...verificationView(root, snap, t),
});
