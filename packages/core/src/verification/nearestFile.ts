import type { RepoFiles } from '../model/checkScreening';
import { folderChain } from './folderChain';
import { repoPath } from './repoPath';

/**
 * The first of `names` that is a file in the folder or a folder above it, nearest first (only the folder itself with
 * `here`), as a repo-relative path; undefined when there's none.
 */
export async function nearestFile(o: {
  files: RepoFiles;
  cwd: string;
  names: string[];
  here?: boolean;
}): Promise<string | undefined> {
  for (const dir of o.here ? [o.cwd] : folderChain(o.cwd))
    for (const name of o.names) {
      const rel = repoPath(dir, name);
      if (rel !== undefined && (await o.files.kind(rel)) === 'file') return rel;
    }
  return undefined;
}
