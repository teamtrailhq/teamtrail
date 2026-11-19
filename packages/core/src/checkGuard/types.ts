/** A file's text by repo-relative path: `null` when there is no such file, undefined when it can't be read here. */
export type ReadText = (rel: string) => Promise<string | null | undefined>;

/** The repo as the claim found it (`before`) and as the completion left it (`after`). */
export interface GuardReaders {
  before: ReadText;
  after: ReadText;
}

/** Everything one approved check runs, as far as the guard can read it from its argv and the repo. */
export interface CheckReach {
  check: string;
  /** package.json path → the scripts the check runs from it (pre and post scripts too). */
  scripts: Map<string, Set<string>>;
  /** Programs it runs (`vitest`, `pytest`, `tsc`) → the folders they run in: their config is read near there. */
  tools: Map<string, Set<string>>;
  /** Files its commands name: scripts an interpreter runs, `--config` values. */
  files: Set<string>;
  /** Makefile path → the targets `make` runs from it (`''`: the default one). */
  makefiles: Map<string, Set<string>>;
  /** Nx project.json path → the targets the check runs from it (`nx test web`). */
  targets: Map<string, Set<string>>;
  /** The trail lead's own globs for files the check depends on (verification.json `checks.<name>.guards`). */
  guards: string[];
}
