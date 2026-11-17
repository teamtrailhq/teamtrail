import type { CheckFinding, RepoFiles } from '../model/checkScreening';

/** One command to screen: its words after the program, the folder it runs in (repo-relative) and the repo's files. */
export interface ScreenInput {
  files: RepoFiles;
  cwd: string;
  args: string[];
}

/** A finding before it's named for its check. */
export type Found = Omit<CheckFinding, 'check'>;
