/** How sure a screening finding is that the check can't pass as written. */
export type FindingSeverity = 'wont-run' | 'unsure';

/** What reading the repo found about one check's command, before anything ran. */
export interface CheckFinding {
  /** The check's name. */
  check: string;
  /** `wont-run`: the command fails as the repo is now. `unsure`: it may; Teamtrail can't tell from the files. */
  severity: FindingSeverity;
  /** One plain line; file, script and target names in backticks. */
  text: string;
  /** The command that would run instead, when reading the repo knows it. */
  fix?: CheckFix;
  /**
   * Why it won't run, when that isn't the repo's files: `not-installed`, a program or package it needs isn't installed
   * where it runs (no `node_modules/.bin/ng`, no `.venv`), so installing the dependencies fixes it. Absent: what the
   * repo holds (no such script, file or project file).
   */
  cause?: 'not-installed';
}

/** The command a finding knows would run (`npm run web:lint` for `npm web:lint`), as words. */
export interface CheckFix {
  run: string[];
  /** The finding's text without the suggestion, for when `run` is offered as an action next to it. */
  problem: string;
}

/** A check as screening reads it: its name, argv and folder (relative to the repo root). */
export interface ScreenedCheck {
  name: string;
  run: string[];
  cwd?: string;
}

/**
 * Read-only access to the repository's files, by repo-relative path with `/` separators. Screening only ever reads
 * through it. The default reads this machine's checkout (verification/localRepoFiles.ts); an embedding server whose
 * repos aren't on disk (a hosted workspace reading GitHub) passes its own to the bridge (`repoFiles` in BridgeOptions).
 */
export interface RepoFiles {
  /** The file's text, or undefined when it's missing, a folder, too large or outside the repo. */
  read(rel: string): Promise<string | undefined>;
  /** What is at the path, or undefined when nothing (or something outside the repo) is. */
  kind(rel: string): Promise<'file' | 'dir' | undefined>;
  /**
   * True when these are the files of a checkout where the checks' dependencies get installed (this machine's working
   * copy): what is installed there (`node_modules`, `.venv`, `vendor`) can be read, so a missing one means it isn't
   * installed. Absent for a repo read from elsewhere (a hosted workspace reading GitHub), where installs never show:
   * screening then says nothing about them.
   */
  seesInstalls?: boolean;
}
