import type { InstalledGuide, GuideStatus } from '@teamtrail/core';
import type { MetaPart } from '../../components/ui';

const STATUS_TEXT: Record<GuideStatus, string> = {
  active: 'Active',
  unapproved: 'New, waiting for your approval',
  tampered: 'Changed since you approved it',
  invalid: "Can't be used",
};

/** Statuses of a guide your team wrote, in the words of Write your own. */
const OWN_STATUS_TEXT: Record<GuideStatus, string> = {
  active: 'Approved',
  unapproved: 'Not approved yet',
  tampered: 'Changed since you approved it',
  invalid: "Can't be used",
};

/** A guide file your team wrote: in guides/, never added from a catalog (or approved as a local file). */
export const isHandWritten = (r: InstalledGuide) =>
  r.origin === 'local' && (!r.lock?.source || r.lock.source === 'local');

/** A guide's status in its row: always for your own guides (Approved included), else only when it isn't active. */
export function statusPart(r: InstalledGuide): MetaPart | undefined {
  if (isHandWritten(r)) return { text: OWN_STATUS_TEXT[r.status], strong: r.status === 'active' };
  return r.status === 'active' ? undefined : STATUS_TEXT[r.status];
}

/** Where a guide comes from: built in, a hand-written file, or the catalog host it was added from. */
export function sourceLabel(r: InstalledGuide) {
  if (r.origin === 'builtin') return 'Built in';
  const src = r.lock?.source;
  if (!src || src === 'local') return r.overridesBuiltin ? 'Local, replaces the built-in' : 'Local';
  try {
    return `From ${new URL(src.registry).host}`;
  } catch {
    return 'From a catalog';
  }
}

/** A check command as the trail lead approves it: the exact argv, space-joined. */
export const argvText = (run: string[]) => run.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');

/** Names this short always show in full: clipping them would save nothing. */
const MIN_SHOWN = 3;

/** A guide's name clipped to `room` characters with an ellipsis, never below a few readable characters. */
export function clipName(name: string, room: number) {
  if (name.length <= Math.max(room, MIN_SHOWN + 1)) return name;
  return `${name.slice(0, Math.max(room - 1, MIN_SHOWN)).trimEnd()}…`;
}

/**
 * Verified or Not reviewed: what the catalog said when the trail lead added the guide, as recorded in the lock.
 * Shown only while the guide is active, so a changed file or lock entry never borrows the catalog's review.
 */
export function reviewPart(r: InstalledGuide): MetaPart | undefined {
  const review = r.lock?.review;
  if (!review || r.status !== 'active') return undefined;
  if (!review.verified) return 'Not reviewed';
  const tip = review.reviewedBy.length > 0 ? `Reviewed by ${review.reviewedBy.join(', ')}` : undefined;
  return { text: 'Verified', strong: true, tip };
}
