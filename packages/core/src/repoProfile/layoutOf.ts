import type { RepoLayout, RepoUnit } from '../model/repoProfile';

/**
 * One unit, one workspace (a root and its members, or one folder with several stacks), several unrelated units,
 * or none.
 */
export function layoutOf(units: RepoUnit[]): RepoLayout {
  if (!units.length) return 'none';
  const roots = new Set(units.filter((u) => u.memberOf === undefined).map((u) => u.dir));
  if (roots.size > 1) return 'multi';
  return units.some((u) => u.memberOf !== undefined) ? 'workspace' : 'single';
}
