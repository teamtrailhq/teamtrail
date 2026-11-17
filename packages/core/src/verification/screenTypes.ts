import type { CheckFinding, RepoFiles } from '../model/checkScreening';

/**
 * One command to screen: the program as written, its words after it, the folder it runs in (repo-relative) and the
 * repo's files.
 */
export interface ScreenInput {
  files: RepoFiles;
  cwd: string;
  program: string;
  args: string[];
}

/** A finding before it's named for its check. */
export type Found = Omit<CheckFinding, 'check'>;
