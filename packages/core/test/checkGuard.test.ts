import { describe, expect, it } from 'vitest';
import { checkGuardFindings } from '../src/checkGuard/checkGuardFindings';
import { commandsOf } from '../src/checkGuard/commandsOf';
import { makeReach } from '../src/checkGuard/makeReach';
import type { GuardReaders } from '../src/checkGuard/types';
import type { CheckSpec } from '../src/model/verification';

type Files = Record<string, string>;

const readers = (before: Files, after: Files): GuardReaders => ({
  before: async (rel) => before[rel] ?? null,
  after: async (rel) => after[rel] ?? null,
});

/** The changed files are those whose text differs. */
const changedOf = (before: Files, after: Files) =>
  [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((f) => before[f] !== after[f]);

const pkg = (scripts: Record<string, string>, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ name: 'x', scripts, ...extra }, null, 2);

async function find(o: { checks?: Record<string, CheckSpec>; before: Files; after: Files; changed?: string[] }) {
  const checks = Object.entries(o.checks ?? { test: { run: ['npm', 'test'], timeoutSec: 60 } }).map(([name, spec]) => ({
    name,
    spec,
  }));
  const found = await checkGuardFindings({
    checks,
    changed: o.changed ?? changedOf(o.before, o.after),
    read: readers(o.before, o.after),
  });
  return found.map((f) => f.text);
}

const spec = (...run: string[]): CheckSpec => ({ run, timeoutSec: 60 });

describe('commandsOf', () => {
  it('splits a script line into commands, past assignments and wrappers', () => {
    expect(
      commandsOf('NODE_ENV=test cross-env A=1 vitest run && npm run lint || echo "a && b"; make x | tee y'),
    ).toEqual([
      ['vitest', 'run'],
      ['npm', 'run', 'lint'],
      ['echo', 'a && b'],
      ['make', 'x'],
      ['tee', 'y'],
    ]);
  });
});

describe('makeReach', () => {
  const text = 'VAR = 1\n\ntest: build\n\t@go test ./...\n\nbuild:\n\tgo build\n\ndocs:\n\tmkdocs build\n';
  it('reads the recipes a target reaches, and leaves other rules out of what matters', () => {
    const r = makeReach(text, 'test');
    expect(r.recipes).toEqual(['go test ./...', 'go build']);
    expect(r.relevant).not.toContain('mkdocs');
    expect(r.relevant).toContain('VAR = 1');
  });
});

describe('check guard: what the check runs', () => {
  it('finds the script the check runs changed', async () => {
    const before = { 'package.json': pkg({ test: 'vitest run' }) };
    const after = { 'package.json': pkg({ test: 'vitest run --passWithNoTests || true' }) };
    expect(await find({ before, after })).toEqual(['package.json scripts.test changed']);
  });

  it('follows npm run into nested scripts, pre and post scripts', async () => {
    const before = { 'package.json': pkg({ test: 'npm run unit', unit: 'vitest run', pretest: 'tsc' }) };
    const after = { 'package.json': pkg({ test: 'npm run unit', unit: 'echo ok', pretest: 'echo' }) };
    expect(await find({ before, after })).toEqual([
      'package.json scripts.pretest changed',
      'package.json scripts.unit changed',
    ]);
  });

  it('ignores scripts the check never runs, and dependencies', async () => {
    const before = { 'package.json': pkg({ test: 'vitest run', dev: 'vite' }) };
    const after = {
      'package.json': pkg(
        { test: 'vitest run', dev: 'vite --open', build: 'vite build' },
        { dependencies: { a: '1' } },
      ),
    };
    expect(await find({ before, after })).toEqual([]);
  });

  it("finds the config of the tool the script runs, and not other tools'", async () => {
    const base = { 'package.json': pkg({ test: 'vitest run' }) };
    const before = { ...base, 'vitest.config.ts': 'export default {}', 'eslint.config.js': 'a' };
    const after = { ...base, 'vitest.config.ts': 'export default { exclude: ["**"] }', 'eslint.config.js': 'b' };
    expect(await find({ before, after })).toEqual(["vitest.config.ts changed (vitest's config)"]);
  });

  it("reads jest's config in package.json", async () => {
    const before = { 'package.json': pkg({ test: 'jest' }, { jest: { testPathIgnorePatterns: [] } }) };
    const after = { 'package.json': pkg({ test: 'jest' }, { jest: { testPathIgnorePatterns: ['src'] } }) };
    expect(await find({ before, after })).toEqual(['package.json "jest" changed (jest\'s config)']);
  });

  it("counts only pytest's section of pyproject.toml", async () => {
    const checks = { test: spec('python', '-m', 'pytest') };
    const toml = (deps: string, opts: string) =>
      `[project]\ndependencies = [${deps}]\n\n[tool.pytest.ini_options]\naddopts = "${opts}"\n`;
    const deps = await find({
      checks,
      before: { 'pyproject.toml': toml('', '-q') },
      after: { 'pyproject.toml': toml('"requests"', '-q') },
    });
    expect(deps).toEqual([]);
    const opts = await find({
      checks,
      before: { 'pyproject.toml': toml('', '-q') },
      after: { 'pyproject.toml': toml('', '-q --deselect tests/test_a.py') },
    });
    expect(opts).toEqual(["pyproject.toml changed in pytest's section"]);
  });

  it('finds conftest.py anywhere for pytest', async () => {
    const checks = { test: spec('pytest') };
    const found = await find({ checks, before: { 'tests/conftest.py': 'a' }, after: { 'tests/conftest.py': 'b' } });
    expect(found).toEqual(["tests/conftest.py changed (pytest's config)"]);
  });

  it('finds a file the script runs', async () => {
    const base = { 'package.json': pkg({ test: 'node scripts/check.mjs && bash ./ci/run.sh' }) };
    const before = { ...base, 'scripts/check.mjs': 'a', 'ci/run.sh': 'x' };
    const after = { ...base, 'scripts/check.mjs': 'process.exit(0)', 'ci/run.sh': 'y' };
    expect(await find({ before, after })).toEqual([
      'ci/run.sh changed (the check runs it)',
      'scripts/check.mjs changed (the check runs it)',
    ]);
  });

  it('follows a check in a subfolder, and its --config file', async () => {
    const checks = { lint: { run: ['npx', 'eslint', '--config', 'lint.config.mjs', '.'], timeoutSec: 60, cwd: 'web' } };
    const found = await find({ checks, before: { 'web/lint.config.mjs': 'a' }, after: { 'web/lint.config.mjs': 'b' } });
    expect(found).toEqual(['web/lint.config.mjs changed (the check runs it)']);
  });

  it('follows npm run across workspaces into the packages that changed', async () => {
    const before = {
      'package.json': pkg({ test: 'npm run test --workspaces' }),
      'packages/a/package.json': pkg({ test: 'vitest run' }),
      'packages/a/vitest.config.ts': 'a',
      'packages/b/package.json': pkg({ test: 'vitest run' }),
    };
    const after = {
      ...before,
      'packages/a/vitest.config.ts': 'b',
      'packages/b/package.json': pkg({ test: 'exit 0' }),
    };
    expect(await find({ before, after })).toEqual([
      "packages/a/vitest.config.ts changed (vitest's config)",
      'packages/b/package.json scripts.test changed',
    ]);
  });

  it('reads the make target and what it reaches, not other targets', async () => {
    const checks = { test: spec('make', 'test') };
    const mk = (docs: string, test: string) => `test:\n\t${test}\n\ndocs:\n\t${docs}\n`;
    expect(
      await find({
        checks,
        before: { Makefile: mk('a', 'go test ./...') },
        after: { Makefile: mk('b', 'go test ./...') },
      }),
    ).toEqual([]);
    expect(
      await find({ checks, before: { Makefile: mk('a', 'go test ./...') }, after: { Makefile: mk('a', 'true') } }),
    ).toEqual(['Makefile changed for `make test`']);
  });

  it("finds a file in the check's guards", async () => {
    const checks = { test: { ...spec('npm', 'test'), guards: ['fixtures/**'] } };
    const found = await find({ checks, before: { 'fixtures/db.sql': 'a' }, after: { 'fixtures/db.sql': 'b' } });
    expect(found).toEqual(['fixtures/db.sql changed (guarded by fixtures/**)']);
  });

  it("says when a file it needs couldn't be read", async () => {
    const read: GuardReaders = { before: async () => undefined, after: async () => undefined };
    const found = await checkGuardFindings({
      checks: [{ name: 'test', spec: spec('npm', 'test') }],
      changed: ['package.json'],
      read,
    });
    expect(found.map((f) => f.kind)).toEqual(['unread']);
  });
});

describe('check guard: weakened tests', () => {
  const file = 'src/a.test.ts';
  const two = `describe('a', () => {\n  it('one', () => {\n    expect(1).toBe(1);\n  });\n  it('two', () => {});\n});\n`;

  it('finds a skipped test', async () => {
    const after = two.replace("it('two'", "it.skip('two'");
    expect(await find({ before: { [file]: two }, after: { [file]: after } })).toEqual([`1 test skipped in ${file}`]);
  });

  it('finds xit, describe.skip, it.todo and .only', async () => {
    const after = two.replace("describe('a'", "describe.skip('a'").replace("it('one'", "xit('one'");
    expect(await find({ before: { [file]: two }, after: { [file]: after } })).toEqual([`2 tests skipped in ${file}`]);
    const only = two.replace("it('one'", "it.only('one'");
    expect(await find({ before: { [file]: two }, after: { [file]: only } })).toEqual([
      `1 test focused with .only in ${file}`,
    ]);
  });

  it('finds removed and commented-out tests', async () => {
    const after = two.replace("  it('two', () => {});\n", "  // it('two', () => {});\n");
    expect(await find({ before: { [file]: two }, after: { [file]: after } })).toEqual([`1 test removed from ${file}`]);
  });

  it('finds a deleted test file', async () => {
    expect(await find({ before: { [file]: two }, after: {} })).toEqual([`${file} deleted (2 tests)`]);
  });

  it('lets new tests, edited test bodies and renamed tests through', async () => {
    const edited = two.replace('expect(1).toBe(1)', 'expect(2).toBe(2)').replace("it('two'", "it('second'");
    const added = `${two}\nit('three', () => {});\n`;
    expect(await find({ before: { [file]: two }, after: { [file]: edited } })).toEqual([]);
    expect(await find({ before: { [file]: two }, after: { [file]: added } })).toEqual([]);
    // a new file with a skipped test adds no coverage, and takes none away
    expect(await find({ before: {}, after: { 'src/b.test.ts': "it.skip('x', () => {});\n" } })).toEqual([]);
  });

  it('moving a skip within a file is not a new skip', async () => {
    const before = "it.skip('a', () => {});\nit('b', () => {});\n";
    const after = "it('a', () => {});\nit.skip('b', () => {});\n";
    expect(await find({ before: { [file]: before }, after: { [file]: after } })).toEqual([]);
  });

  it('reads pytest, go, rust and junit tests', async () => {
    const cases: [string, string, string, string][] = [
      ['tests/test_a.py', 'def test_a():\n    pass\n', '@pytest.mark.skip\ndef test_a():\n    pass\n', 'skipped'],
      ['a_test.go', 'func TestA(t *testing.T) {\n}\n', 'func TestA(t *testing.T) {\n\tt.Skip("later")\n}\n', 'skipped'],
      ['src/lib.rs', '#[test]\nfn a() {}\n', '#[test]\n#[ignore]\nfn a() {}\n', 'skipped'],
      ['ATest.java', '@Test\nvoid a() {}\n@Test\nvoid b() {}\n', '@Test\nvoid a() {}\n', 'removed'],
    ];
    for (const [f, before, after, word] of cases) {
      const found = await find({ before: { [f]: before }, after: { [f]: after } });
      expect(found.join(), f).toContain(word);
    }
  });

  it('never reads a test in a markdown file', async () => {
    expect(await find({ before: { 'README.md': "it('x', () => {})\n" }, after: { 'README.md': '' } })).toEqual([]);
  });
});
