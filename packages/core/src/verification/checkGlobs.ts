/** At most this many globs in a check's `guards` or `paths`. */
export const MAX_CHECK_GLOBS = 50;

const ok = (g: unknown) =>
  typeof g === 'string' && g.length > 0 && g.length <= 300 && !g.startsWith('/') && !g.split('/').includes('..');

/**
 * Whether `v` is a list of repo-relative path globs a check may name (`guards`, `paths`): strings of up to 300
 * characters, never absolute, never `..`, at most 50.
 */
export function checkGlobs(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= MAX_CHECK_GLOBS && v.every(ok);
}
