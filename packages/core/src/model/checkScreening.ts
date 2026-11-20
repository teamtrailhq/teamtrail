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

/** A variable name the repo's files suggest its tests read, and what checks on this machine would get of it. */
export interface NeededVariable {
  name: string;
  /** Where the name was seen: `listed in .env.example`, `set in CI (.github/workflows/ci.yml)`. */
  why: string;
  /** Its name reads like a credential (`STRIPE_SECRET_KEY`): a check only gets it if the person names it exactly. */
  secretShaped: boolean;
  /** A check would be passed it: on the allowlist, or a name or pattern the person gave. */
  passes: boolean;
  /** The shell that started this Teamtrail has it set. Presence only: a value is never read for this. */
  set: boolean;
}

/**
 * Settings → Verification → Variables checks can read (`GET /verification/variables`, this machine only): names only,
 * never a value, anywhere. Values come from the shell that started `teamtrail`.
 */
export interface CheckVariables {
  /** Passed to every check when set (names, and prefixes ending in `_`), unless a name reads like a secret. */
  allowlist: { names: string[]; prefixes: string[] };
  /** Named in `TEAMTRAIL_CHECK_ENV` in the shell that started this Teamtrail. */
  fromShell: string[];
  /** Added in Settings on this machine (`<config dir>/projects/<id>/check-env.json`). */
  added: string[];
  /** Names the repo's files suggest its tests read (env examples, CI `env:`), from its profile; none without a checkout. */
  needed: NeededVariable[];
}
