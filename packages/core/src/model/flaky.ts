/**
 * A check that passed on code it had already failed on: the same command (name, argv and folder), the same commit and
 * uncommitted changes, an earlier attempt of the same ticket. A retry got it through, not a fix.
 */
export interface FlakyCheck {
  name: string;
  argv: string[];
  /** The earlier attempt it failed in. */
  failedIn: string;
  /** How it failed there, in words: `exited 1`, `timed out`, `could not run`. */
  failure: string;
  /** The commit both runs were on; null before the first commit. */
  head: string | null;
  /** The failing test, when the runner's output names exactly one (flaky/failingTestName.ts). */
  test?: string;
}

/**
 * The `flaky` gate on a passing attempt: the checks that passed only on retry, and how the gate acted. `enforce`
 * held the ticket for the human (the pass doesn't count until they accept it); `observe` let it through, flagged.
 */
export interface AttemptFlaky {
  mode: 'observe' | 'enforce';
  checks: FlakyCheck[];
}

/** One check (and test, when known) seen failing and passing on the same code, across the project. */
export interface FlakyCheckRow {
  name: string;
  test?: string;
  /** Times it flipped on unchanged code: one per ticket and code it happened on. */
  count: number;
  /** Keys of the tickets it happened on, by trail, then ticket. */
  tickets: string[];
  /** When it was last seen flipping (the later attempt's finish). */
  lastSeen: number;
}

/** `GET /flaky-checks`: the project's flaky checks, and how the `flaky` gate acts on this machine. */
export interface FlakyChecksView {
  rows: FlakyCheckRow[];
  mode: 'off' | 'observe' | 'enforce';
}
