import { childEnv, type ChildEnv } from '../lib/childEnv';
import { BRAND } from '../model/brand';

/**
 * Where a person names the extra variables their checks need: `TEAMTRAIL_CHECK_ENV`, in the environment of the
 * `teamtrail` that runs the checks (`TEAMTRAIL_CHECK_ENV="DATABASE_URL, REDIS_URL, APP_*"`), separated by
 * commas or spaces. It lives on the person's machine on purpose: a list committed to the repo would let a
 * teammate's push, or an agent's edit, decide which of your secrets a check command gets.
 */
export const CHECK_ENV = `${BRAND.slug.toUpperCase()}_CHECK_ENV`;

/** The environment a check command runs in: the allowlist of childEnv.ts plus the names in `TEAMTRAIL_CHECK_ENV`. */
export function checkEnv(source: NodeJS.ProcessEnv): ChildEnv {
  const extra = (source[CHECK_ENV] ?? '').split(/[\s,]+/).filter(Boolean);
  return childEnv(source, extra);
}

const SHOWN = 40;

/** The line a failed check's log ends with, so a test that missed a variable says so. Names only. */
export function withheldNote(withheld: string[]) {
  const names = withheld.filter((n) => n !== CHECK_ENV).sort();
  if (!names.length) return '';
  const more = names.length > SHOWN ? ` and ${names.length - SHOWN} more` : '';
  return (
    `\n[${BRAND.slug}: ${names.length} environment variables were not passed to this check: ` +
    `${names.slice(0, SHOWN).join(', ')}${more}. If it needs one, name it in ${CHECK_ENV} where you start ${BRAND.slug}.]\n`
  );
}
