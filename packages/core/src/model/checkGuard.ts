/**
 * What the check guard found in a completion: the work changed what an approved check runs, or weakened the tests it
 * runs. The trail lead approves a check's argv (`npm test`); these are the changes that make its pass mean less.
 * - `script`: a package.json script the check reaches (`npm test` → `scripts.test` → `npm run unit` → …).
 * - `runner-config`: the config of a tool the check runs (vitest.config.ts, jest's key in package.json, pytest.ini).
 * - `named-file`: a file the check's command or scripts name (`node scripts/check.mjs`, `bash ci/test.sh`).
 * - `makefile`: the makefile of a `make` check, outside the rules of targets it doesn't run.
 * - `guarded`: a file matching the check's `guards` in verification.json.
 * - `unread`: one of those changed and Teamtrail couldn't read it to compare (a remote completion).
 * - `skipped`, `focused`: tests turned off (`it.skip`, `@pytest.mark.skip`, `t.Skip(`, `#[ignore]`) or narrowed
 *   (`it.only`) in a file that had them.
 * - `removed-tests`: fewer test cases in a file than before; `deleted-tests`: a test file deleted.
 */
export type GuardFindingKind =
  | 'script'
  | 'runner-config'
  | 'named-file'
  | 'makefile'
  | 'guarded'
  | 'unread'
  | 'skipped'
  | 'focused'
  | 'removed-tests'
  | 'deleted-tests';

export interface GuardFinding {
  kind: GuardFindingKind;
  /** Repo-relative, `/` separators. */
  file: string;
  /** The check it concerns; unset for test changes, which weaken whatever runs them. */
  check?: string;
  /** One plain line naming the file and what changed: "package.json scripts.test changed". */
  text: string;
}

/**
 * The check guard's record on an attempt. `enforce`: a pass doesn't count until the trail lead accepts it; `observe`:
 * it counted, and the findings were shown to the reviewer and journaled.
 */
export interface AttemptGuard {
  mode: 'observe' | 'enforce';
  findings: GuardFinding[];
}
