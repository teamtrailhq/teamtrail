import type { SlackUser } from './types';

/** An owner from an earlier version, dropped because nothing on this machine ever confirmed it. */
export type OwnerRedo = { was: SlackUser; via: 'home' | 'git-email' };

/** A Slack account waiting for the trail lead's confirmation, and when it was put forward. */
export type PendingOwner = SlackUser & { at?: number };

/**
 * The owner as this version reads a saved config. Only an account the trail lead confirmed here, after it entered a
 * code shown on this machine, is the owner. Earlier versions made the first member to click "This is me", or the
 * member whose email was the git email, the owner without either; such an owner is dropped, not offered for a
 * one-click confirmation (its name can be set to anyone's), and `ownerRedo` tells Settings why. Likewise only an
 * account that entered the code can be waiting for confirmation.
 */
export function settleOwners(c: { owners?: SlackUser[]; pendingOwner?: PendingOwner; ownerRedo?: OwnerRedo }) {
  const all = c.owners ?? [];
  const owners = all.filter((o) => o.confirmedAt !== undefined);
  const pendingOwner = !owners.length && c.pendingOwner?.via === 'code' ? c.pendingOwner : undefined;
  const old = owners.length ? undefined : all[0];
  // Saved once read: the store writes back what it read, so the notice stays until an owner is confirmed or reset.
  const kept = owners.length ? undefined : c.ownerRedo;
  const ownerRedo: OwnerRedo | undefined = old
    ? { was: { id: old.id, ...(old.name ? { name: old.name } : {}) }, via: viaOf(old) }
    : kept;
  return { owners, pendingOwner, ownerRedo };
}

const viaOf = (o: SlackUser): 'home' | 'git-email' => (o.via === 'git-email' ? 'git-email' : 'home');
