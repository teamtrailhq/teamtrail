import { envNamePasses } from '../lib/envNamePasses';

/** A variable name, or a `PREFIX_*` pattern of at least two characters before the star. */
const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,99}$|^[A-Za-z_][A-Za-z0-9_]{1,98}\*$/;

/** Why `name` can't be one of the variables checks may read (checkEnvNames.ts), or undefined. */
export function checkEnvNameProblem(name: string): string | undefined {
  if (!NAME.test(name)) return `"${name}" isn't a variable name (letters, digits and _, or a PREFIX_* pattern)`;
  if (!envNamePasses(name, [name])) return `${name} is Teamtrail's own: it never reaches a check`;
  return undefined;
}
