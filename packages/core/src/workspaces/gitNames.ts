/** A commit or tree id as git prints it: hex only, so it can never be read as an option or a path. */
export const isObjectId = (s: unknown): s is string => typeof s === 'string' && /^[0-9a-f]{7,64}$/.test(s);

/**
 * A branch name Teamtrail will hand to git: letters, digits, `.`, `_`, `-` and `/` only, never starting with
 * `-`, and none of the forms git itself refuses (`..`, `//`, a part starting with `.` or ending in `.lock`).
 */
export function isBranchName(s: unknown): s is string {
  if (typeof s !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(s)) return false;
  if (s.includes('..') || s.includes('//') || s.endsWith('/') || s.endsWith('.')) return false;
  return s.split('/').every((part) => !part.startsWith('.') && !part.startsWith('-') && !part.endsWith('.lock'));
}

/** The part of a ticket key that names its branch and folder (`#12` → `12`): one plain path segment. */
export const isTicketSlug = (s: string) => /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(s);
