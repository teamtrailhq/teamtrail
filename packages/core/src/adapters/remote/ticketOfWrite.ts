import type { QueuedWrite } from './sync/types';

/** The ticket a write is about; none for a write to the trail itself. */
export function ticketOfWrite(w: QueuedWrite): string | undefined {
  const c = w.change;
  if ('ticketId' in c) return c.ticketId;
  if (c.kind === 'blocking' || c.kind === 'unblocking') return c.blockedId;
  if (c.kind === 'decision') return c.decision.ticketId ?? undefined;
  return undefined;
}
