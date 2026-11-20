import path from 'node:path';
import { childEnv, type ChildEnv } from '../lib/childEnv';
import { BRAND } from '../model/brand';

/**
 * Where a person names the extra variables their checks need: `TEAMTRAIL_CHECK_ENV`, in the environment of the
 * `teamtrail` that runs the checks (`TEAMTRAIL_CHECK_ENV="DATABASE_URL, REDIS_URL, APP_*"`), separated by
 * commas or spaces, or Settings → Project → Check variables on this machine (checkEnvNames.ts). Either way it lives on the
 * person's machine on purpose: a list committed to the repo would let a teammate's push, or an agent's edit, decide
 * which of your secrets a check command gets. Names only: values always come from that environment.
 */
export const CHECK_ENV = `${BRAND.slug.toUpperCase()}_CHECK_ENV`;

/** The names `TEAMTRAIL_CHECK_ENV` lists in `source`. */
export const shellCheckEnvNames = (source: NodeJS.ProcessEnv) =>
  (source[CHECK_ENV] ?? '').split(/[\s,]+/).filter(Boolean);

/**
 * PATH with its absolute folders only. An empty entry, `.` or any relative folder would make a bare program name
 * (`pytest`) find a file in the check's own folder, which an agent can write, so a check Teamtrail knows by its name
 * would run something else (guides/programIdentity.ts: a bare name is one found on PATH).
 */
function absoluteOnly(value: string): string {
  return value
    .split(path.delimiter)
    .filter((dir) => dir && path.isAbsolute(dir))
    .join(path.delimiter);
}

/**
 * The environment a check command runs in: the allowlist of childEnv.ts plus the names in `TEAMTRAIL_CHECK_ENV` and
 * `names`, the ones this machine's person added in Settings (checkEnvNames.ts), with PATH's relative folders left out.
 */
export function checkEnv(source: NodeJS.ProcessEnv, names: string[] = []): ChildEnv {
  const out = childEnv(source, [...shellCheckEnvNames(source), ...names]);
  for (const name of Object.keys(out.env))
    if (name.toUpperCase() === 'PATH') out.env[name] = absoluteOnly(out.env[name] ?? '');
  return out;
}

const SHOWN = 40;

/** The line a failed check's log ends with, so a test that missed a variable says so. Names only. */
export function withheldNote(withheld: string[]) {
  const names = withheld.filter((n) => n !== CHECK_ENV).sort();
  if (!names.length) return '';
  const more = names.length > SHOWN ? ` and ${names.length - SHOWN} more` : '';
  return (
    `\n[${BRAND.slug}: ${names.length} environment variables were not passed to this check: ` +
    `${names.slice(0, SHOWN).join(', ')}${more}. If it needs one, add its name in Settings → Verification → ` +
    `Variables checks can read (or ${CHECK_ENV} where you start ${BRAND.slug}); its value comes from that shell.]\n`
  );
}
