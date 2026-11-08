import type { InstalledGuide, GuideStatus } from '@teamtrail/core';

export const STATUS_TEXT: Record<GuideStatus, string> = {
  active: 'Active',
  unapproved: 'New, waiting for your approval',
  tampered: 'Changed since you approved it',
  invalid: "Can't be used",
};

/** Where a guide comes from: built in, a hand-written file, or the catalog host it was added from. */
export function sourceLabel(r: InstalledGuide) {
  if (r.origin === 'builtin') return 'Built in';
  const src = r.lock?.source;
  if (!src || src === 'local') return r.overridesBuiltin ? 'Local file, replaces the built-in' : 'Local file';
  try {
    return `From ${new URL(src.registry).host}`;
  } catch {
    return 'From a catalog';
  }
}

/** A check command as the trail lead approves it: the exact argv, space-joined. */
export const argvText = (run: string[]) => run.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ');
