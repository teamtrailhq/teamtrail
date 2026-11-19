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
    skip: /@pytest\.mark\.(?:skip|skipif|xfail)\b|@unittest\.(?:skip\w*|expectedFailure)\b|\bpytest\.(?:skip|xfail)\s*\(|\.skipTest\s*\(/g,
  },
  {
    file: /_test\.go$/,
    test: /^func\s+(?:\([^)]*\)\s*)?Test\w*\s*\(/gm,
    skip: /\.Skip(?:f|Now)?\s*\(/g,
  },
  {
    file: /\.rs$/,
    test: /#\[(?:(?:tokio|async_std)::)?test\b|#\[rstest\b|#\[test_case\b/g,
    skip: /#\[ignore\b/g,
  },
  {
    // JUnit 4 and 5, TestNG, Kotest's annotations; @Disabled and its conditional forms (@DisabledOnOs…)
    file: /\.(java|kt|kts|groovy|scala)$/,
    test: /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory)\b/g,
    skip: /@(?:Disabled\w*|Ignore)\b|@Test\s*\([^)]*\benabled\s*=\s*false/g,
  },
  {
    // xUnit, NUnit, MSTest: a Skip on [Fact]/[Theory], [Ignore], [Explicit], Assert.Ignore/Inconclusive
    file: /\.(cs|fs|vb)$/,
    test: /\[(?:<)?(?:Fact|Theory|Test|TestMethod|TestCase|DataTestMethod)\b/g,
    skip: /\b(?:Fact|Theory)\s*\([^)\]]*\bSkip\s*=|[[,]\s*(?:<)?(?:Ignore|Explicit)\b|\bAssert\.(?:Ignore|Inconclusive)\s*\(|\bSkip\.(?:If|Unless)\s*\(/g,
  },
  {
    // PHPUnit (testX methods, #[Test], @test) and Pest (it/test)
    file: /\.php$/,
    test: /^\s*(?:(?:public|protected|private|static|final)\s+)*function\s+test\w*\s*\(|#\[Test\]|@test\b|^\s*(?:it|test)\s*\(\s*['"]/gm,
    skip: /\bmarkTest(?:Skipped|Incomplete)\s*\(|#\[(?:Group\s*\(\s*['"]skip|RequiresPhp)|->(?:skip|todo)\s*\(/g,
    focus: /->only\s*\(/g,
  },
  {
    // XCTest (testX methods) and Swift Testing (@Test)
    file: /\.swift$/,
    test: /^\s*(?:@MainActor\s+)?(?:(?:override|public|private|internal|final)\s+)*func\s+test\w*\s*\(|@Test\b/gm,
    skip: /\bXCTSkip(?:If|Unless)?\b|\.disabled\s*\(/g,
  },
  {
    file: /_test\.exs$/,
    test: /^\s*test\s+"/gm,
    skip: /@(?:tag|moduletag|describetag)\s+(?::skip\b|skip:)/g,
  },
  {
    file: /_test\.dart$/,
    test: /^\s*(?:test|testWidgets)\s*\(\s*['"]/gm,
    skip: /\bskip\s*:\s*(?!false\b)/g,
    focus: /\bsolo\s*:\s*true\b/g,
  },
  {
    file: /_spec\.rb$|_test\.rb$/,
    test: /^\s*(?:[xf]?(?:it|specify|scenario)|test)\s+['"]|^\s*def\s+test_/gm,
    skip: /^\s*(?:xit|skip|pending|xdescribe|xcontext|xspecify|xscenario)\b/gm,
    focus: /^\s*(?:fit|fdescribe|fcontext|fspecify|fscenario)\b|\bfocus:\s*true\b/gm,
  },
];
