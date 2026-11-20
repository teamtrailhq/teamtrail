import type { RepoUnit } from '../model/repoProfile';
import type { ApprovedCheck } from './types';

const inside = (cwd: string, dir: string) => cwd === dir || (!!dir && cwd.startsWith(`${dir}/`));

/**
 * The approved check that runs in the unit's folder, inside it, or at the workspace root that builds it. A check in
 * a subfolder doesn't run the top unit's own tests: the top is covered only by a check that runs there.
 */
export function unitChecked(unit: RepoUnit, checks: ApprovedCheck[]): ApprovedCheck | undefined {
  return checks.find((c) => inside(c.cwd, unit.dir) || (unit.memberOf !== undefined && c.cwd === unit.memberOf));
}
