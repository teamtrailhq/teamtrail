import type { CommandRole, Ecosystem } from './repoProfile';

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
   * A folder's entries, sorted by name, or undefined when it's missing, not a folder or outside the repo. Optional: a
   * reader that can't list (older embedding servers) leaves it out, and the repo profile then reads the top folder
   * only. Symbolic links are left out, so a listing never leads outside the repo or round in a loop.
   */
  list?(rel: string): Promise<RepoEntry[] | undefined>;
}

/** One entry of a folder listing: its name and whether it's a file or a folder. */
export interface RepoEntry {
  name: string;
  kind: 'file' | 'dir';
}

/** A check reading the repo suggests (repoProfile/suggestChecks.ts), as the checks editor would add it: argv, folder, and why. */
export interface CheckSuggestion {
  name: string;
  run: string[];
  /** Repo-relative folder, '' for the top. */
  cwd: string;
  role: CommandRole;
  ecosystem: Ecosystem;
  from: string;
  /** One of the known check shapes; otherwise saving it needs the person's acknowledgement. */
  known: boolean;
}
