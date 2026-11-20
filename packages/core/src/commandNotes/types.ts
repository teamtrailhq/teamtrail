import type { Ecosystem, Need } from '../model/repoProfile';

/** The source every note Teamtrail writes from the repo profile carries, besides its unit's. */
export const PROFILE_SOURCE = 'import:repo-profile';
/** The tag that marks a note of a package's commands. */
export const COMMANDS_TAG = 'commands';

/**
 * A suggested knowledge entry of one unit's commands (commandNotes.ts): how to install, build, test, lint and run it,
 * the setup and checks Teamtrail runs for it, and what its tests need. `unit` (`unit:apps/web:node`) finds it again.
 */
export interface CommandNote {
  unit: string;
  dir: string;
  ecosystem: Ecosystem;
  title: string;
  body: string;
  scope: string[];
  tags: string[];
  /** The manifests and lockfiles it was read from: a change to one marks the confirmed note as maybe outdated. */
  anchors: string[];
}

/** One package's commands as a claim hands them to the agent (claimCommands.ts). */
export interface PackageCommands {
  /** Repo-relative folder, `.` for the top. */
  package: string;
  ecosystem: Ecosystem;
  /** The note the trail lead confirmed (or kept as an assumption): the commands, from what they reviewed. */
  notes?: { id: string; status: 'confirmed' | 'assumption'; body: string; mayBeOutdated?: string[] };
  /** Why there are no notes to trust yet. */
  waiting?: string;
  /** Setup steps Teamtrail runs before checks in the worktrees it prepares, from the approved verification.json. */
  setup?: { step: string; run: string; cwd: string }[];
  /** Approved checks that run in this package's folder or are scoped to it. */
  checks?: { name: string; run: string; cwd: string }[];
  /** What its tests need, read from the repo's files (names only); variables say whether checks here get them. */
  needs?: (Need & { passedToChecks?: boolean })[];
}
