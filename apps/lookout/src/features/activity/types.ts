import type { ActivityState, MapSnapshot, TicketLease, TrailDone } from '@teamtrail/core';

export type ZoneProps = {
  activity: ActivityState;
  snap?: MapSnapshot;
  leases?: TicketLease[];
  onTicket: (id: string) => void;
  onOpenChat: (id: string) => void;
  /** Whether the trail is done: the step panel then shows that in place of the last step. */
  done?: TrailDone;
};
