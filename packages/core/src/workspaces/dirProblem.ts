/**
 * Why a `dir` from workspaces.json can't be used as written, before the disk is looked at: it must be a relative
 * path written with "/". Pure (no node:path), because the Lookout parses the file too.
 */
export function dirProblem(dir: string): string | undefined {
  const absolute = dir.startsWith('/') || /^[A-Za-z]:/.test(dir);
  if (absolute || dir.startsWith('~') || dir.includes('\\'))
    return 'must be a relative path with "/" (for example "../worktrees")';
  return undefined;
}
