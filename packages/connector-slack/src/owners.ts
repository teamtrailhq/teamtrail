import type { SlackUser } from './types';

/** A Slack account waiting for the trail lead's confirmation, and when it was put forward. */
export type PendingOwner = SlackUser & { at?: number };

/** An owner counts once the trail lead confirmed it here, or when an earlier version matched it by git email. */
const settled = (o: SlackUser) => o.confirmedAt !== undefined || o.via === 'git-email';

/**
 * The owner as this version reads a saved config. Earlier versions made the first workspace member who clicked
 * "This is me" the owner; such an owner is only put forward again, and waits for the trail lead to confirm it once
 * in the Lookout. An owner matched by git email, or confirmed here, stays.
 */
export function settleOwners(c: { owners?: SlackUser[]; pendingOwner?: PendingOwner }) {
  const all = c.owners ?? [];
  const owners = all.filter(settled);
  if (owners.length) return { owners, pendingOwner: undefined };
  const unconfirmed = all.find((o) => !settled(o));
  const legacy: PendingOwner | undefined = unconfirmed ? { ...unconfirmed, via: unconfirmed.via ?? 'home' } : undefined;
  return { owners, pendingOwner: c.pendingOwner ?? legacy };
}
