import type { GuardFinding } from '../model/checkGuard';
import { TEST_PATTERNS, type TestPatterns } from './testPatterns';
import type { GuardReaders } from './types';

/**
 * Where tests live: test folders (`tests/`, Swift's `Tests/`, .NET's `App.Tests/`), and files named as tests by the
 * usual conventions (`a.test.ts`, `a_test.go`, `test_a.py`, `AppTest.java`, `AppTests.cs`, `AppTest.php`,
 * `AppTests.swift`, `a_test.exs`, `a_test.dart`, `AppSpec.kt`); Rust keeps them next to the code. Only these are
 * read, so a change to thousands of source files doesn't read them all.
 */
const TEST_PATH =
  /(^|\/)(tests?|Tests?|__tests__|specs?|e2e|[\w.-]+\.(Unit)?Tests?)\/|[._-](test|spec)s?\.[^/]+$|(^|\/)test_[^/]*\.py$|(Tests?|Spec|IT)\.(java|kt|kts|groovy|scala|cs|fs|vb|php|swift)$|\.rs$/;

const count = (text: string | null | undefined, r: RegExp | undefined) =>
  text && r ? (text.match(r) ?? []).length : 0;
const tests = (n: number) => `${n} test${n === 1 ? '' : 's'}`;

/** What one changed file did to its tests: deleted, fewer, skipped or focused, each counted net of what was there. */
function weakened(file: string, p: TestPatterns, before: string, after: string | null | undefined) {
  const had = count(before, p.test);
  if (after === null)
    return had ? [{ kind: 'deleted-tests' as const, file, text: `${file} deleted (${tests(had)})` }] : [];
  if (after === undefined) return [];
  const out: GuardFinding[] = [];
  const removed = had - count(after, p.test);
  if (removed > 0) out.push({ kind: 'removed-tests', file, text: `${tests(removed)} removed from ${file}` });
  const skipped = count(after, p.skip) - count(before, p.skip);
  if (skipped > 0) out.push({ kind: 'skipped', file, text: `${tests(skipped)} skipped in ${file}` });
  const focused = count(after, p.focus) - count(before, p.focus);
  if (focused > 0) out.push({ kind: 'focused', file, text: `${tests(focused)} focused with .only in ${file}` });
  return out;
}

/**
 * Tests the work weakened, in the files it changed: a test file deleted, test cases removed, tests skipped or focused
 * (`.only` turns the file's other tests off). Only files that existed before count, so new tests (skipped or not) are
 * never a finding, and editing a test's body or renaming it isn't either. A file that can't be read on both sides
 * says nothing.
 */
export async function testFindings(o: { changed: string[]; read: GuardReaders }): Promise<GuardFinding[]> {
  const out: GuardFinding[] = [];
  for (const file of o.changed) {
    const p = TEST_PATTERNS.find((x) => x.file.test(file));
    if (!p || !TEST_PATH.test(file) || file.split('/').includes('node_modules')) continue;
    const before = await o.read.before(file);
    if (typeof before !== 'string') continue;
    out.push(...weakened(file, p, before, await o.read.after(file)));
  }
  return out;
}
