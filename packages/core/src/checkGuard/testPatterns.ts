/** How one language writes a test case, a test turned off and a test focused on (which turns the rest off). */
export interface TestPatterns {
  /** Files it applies to. */
  file: RegExp;
  test: RegExp;
  skip: RegExp;
  focus?: RegExp;
}

const JS_BLOCK = '(?:it|test|describe|suite|context|specify)';

/**
 * Test syntax by language, global and line-anchored where a name could appear in other code. Counting these before
 * and after a change is cheap and deterministic: a test renamed or edited keeps its count, one removed or skipped
 * doesn't. Commented-out tests stop matching, so they count as removed.
 */
export const TEST_PATTERNS: TestPatterns[] = [
  {
    file: /\.(m?[jt]sx?|c[jt]s)$/,
    test: /^\s*(?:it|test|specify|xit|xtest|fit)(?:\.\w+(?:\([^)]*\))?)*\s*\(\s*['"`]/gm,
    skip: new RegExp(
      `\\b${JS_BLOCK}\\.(?:skip|todo|skipIf|fixme)\\b|\\b(?:xit|xtest|xdescribe|xcontext|xspecify)\\s*\\(|\\bthis\\.skip\\s*\\(`,
      'g',
    ),
    focus: new RegExp(`\\b${JS_BLOCK}\\.only\\b|\\b(?:fit|fdescribe)\\s*\\(`, 'g'),
  },
  {
    file: /\.py$/,
    test: /^\s*(?:async\s+)?def\s+test\w*\s*\(/gm,
    skip: /@pytest\.mark\.(?:skip|skipif|xfail)\b|@unittest\.skip\w*|\bpytest\.skip\s*\(|\.skipTest\s*\(/g,
  },
  {
    file: /_test\.go$/,
    test: /^func\s+(?:\([^)]*\)\s*)?Test\w*\s*\(/gm,
    skip: /\.Skip(?:f|Now)?\s*\(/g,
  },
  { file: /\.rs$/, test: /#\[(?:tokio::)?test\b/g, skip: /#\[ignore\b/g },
  { file: /\.(java|kt)$/, test: /@Test\b/g, skip: /@(?:Disabled|Ignore)\b/g },
  {
    file: /_spec\.rb$|_test\.rb$/,
    test: /^\s*(?:it|specify|scenario|test)\s+['"]|^\s*def\s+test_/gm,
    skip: /^\s*(?:xit|skip|pending|xdescribe|xcontext)\b/gm,
    focus: /^\s*(?:fit|fdescribe|fcontext)\b/gm,
  },
];
