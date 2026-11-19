/** The stacks the repo profile knows (repoProfile/), one per kind of manifest. */
export type Ecosystem =
  'node' | 'python' | 'go' | 'rust' | 'jvm' | 'ruby' | 'php' | 'dotnet' | 'swift' | 'elixir' | 'dart' | 'deno';

/** What a unit's command is for. `check` is a build tool's own everything-it-verifies task (`./gradlew check`). */
export type CommandRole = 'test' | 'lint' | 'typecheck' | 'format' | 'check' | 'build';

/** A command a unit's files say it has, as argv, with the folder it runs in and the file it was read from. */
export interface UnitCommand {
  role: CommandRole;
  run: string[];
  /** Repo-relative folder, '' for the top. */
  cwd: string;
  /** Where it was read: `package.json scripts.test`, `Makefile target lint`, `go.mod`. */
  from: string;
}

/** A toolchain version the repo pins in a file (never probed). */
export interface Toolchain {
  name: string;
  version: string;
  from: string;
}

/** What the tests seem to need beyond the code: names and reasons only, never a value. */
export type Need =
  | { kind: 'browser'; name: string; why: string }
  | { kind: 'service'; name: string; why: string }
  | { kind: 'variable'; name: string; secretShaped: boolean; why: string };

/** One buildable part of the repo: a folder with a manifest of one ecosystem. */
export interface RepoUnit {
  /** Repo-relative folder, '' for the top. */
  dir: string;
  ecosystem: Ecosystem;
  /** npm, pnpm, yarn, bun, uv, poetry, pipenv, pdm, pip, go, cargo, gradle, maven, bundler, composer, dotnet, … */
  manager?: string;
  manifest: string;
  lockfile?: string;
  /** The workspace root folder that installs and builds it, when it's a member of one. */
  memberOf?: string;
  toolchain?: Toolchain;
  /** The frozen install from the unit's own lockfile, as argv; only on install roots. Never run by the profile. */
  install?: string[];
  commands: UnitCommand[];
  needs: Need[];
}

export type WorkspaceToolName =
  | 'npm'
  | 'pnpm'
  | 'yarn'
  | 'bun'
  | 'nx'
  | 'turbo'
  | 'lerna'
  | 'go-work'
  | 'cargo'
  | 'gradle'
  | 'maven'
  | 'uv'
  | 'dotnet';

/** A tool that ties several units together, where it's declared and the member patterns it names. */
export interface WorkspaceTool {
  tool: WorkspaceToolName;
  dir: string;
  from: string;
  members: string[];
}

/** A command seen in CI, as a hint: argv only when the line is one simple command (no pipes, `&&`, variables). */
export interface CiHint {
  file: string;
  line: string;
  run?: string[];
}

/** One unit, one workspace, several unrelated units, or nothing Teamtrail recognises. */
export type RepoLayout = 'single' | 'workspace' | 'multi' | 'none';

/**
 * What reading the repo's files says it is (repoProfile/detectRepoProfile.ts): deterministic, from file reads only,
 * nothing executed. `basis` is the sha256 of what was listed and read, so the profile changes only when they do.
 */
export interface RepoProfile {
  v: 1;
  basis: string;
  layout: RepoLayout;
  /** Shallowest first, then by folder. */
  units: RepoUnit[];
  workspaceTools: WorkspaceTool[];
  /** Instructions for agents already in the repo: AGENTS.md, CLAUDE.md, CONTRIBUTING.md, … */
  agentDocs: string[];
  ci: CiHint[];
  /** Project-wide needs (CI services, compose files, the top's env example). */
  needs: Need[];
  /** A limit cut the walk short (folders, files, units): the profile may miss parts of the repo. */
  truncated: boolean;
  /** False when the files couldn't be listed: only the top folder was read. */
  listed: boolean;
}
