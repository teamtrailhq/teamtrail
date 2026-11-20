import type { RepoUnit } from '../model/repoProfile';

const folder = (cwd: string | undefined) => (cwd ?? '').replace(/^\.\/?/, '').replace(/\/+$/, '');

/**
 * Whether something that runs in `cwd` is for this unit: it runs in the unit's folder, or (`member`) in the workspace
 * that installs it.
 */
export function inUnit(o: { unit: RepoUnit; cwd?: string; member?: boolean }): boolean {
  const at = folder(o.cwd);
  if (at === o.unit.dir) return true;
  return !!o.member && o.unit.memberOf !== undefined && at === o.unit.memberOf;
}
