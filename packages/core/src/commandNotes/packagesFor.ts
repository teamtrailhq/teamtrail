import type { RepoProfile, RepoUnit } from '../model/repoProfile';

const MAX_PACKAGES = 4;

/** The folder part of a path or glob: everything before its first wildcard segment. */
function folderOf(p: string): string {
  const parts = p.replace(/^\.\//, '').split('/');
  const wild = parts.findIndex((s) => /[*?[{]/.test(s));
  return (wild === -1 ? parts : parts.slice(0, wild)).join('/');
}

const contains = (dir: string, path: string) => !dir || path === dir || path.startsWith(`${dir}/`);

/**
 * The units a ticket's work is in: for each path (the claim's touches, paths the ticket names), the deepest unit whose
 * folder holds it, all of that folder's stacks. Without paths, or when none is in a unit, the top folder's units. In
 * the profile's order, at most four.
 */
export function packagesFor(profile: RepoProfile, paths: string[]): RepoUnit[] {
  const folders = paths.map(folderOf);
  const dirs = new Set<string>();
  for (const f of folders) {
    const deepest = profile.units
      .filter((u) => contains(u.dir, f))
      .reduce<string | undefined>(
        (best, u) => (best === undefined || u.dir.length > best.length ? u.dir : best),
        undefined,
      );
    if (deepest !== undefined) dirs.add(deepest);
  }
  if (!dirs.size) dirs.add('');
  return profile.units.filter((u) => dirs.has(u.dir)).slice(0, MAX_PACKAGES);
}
