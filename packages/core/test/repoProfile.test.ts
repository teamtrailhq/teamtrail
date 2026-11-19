import { describe, expect, it } from 'vitest';
import type { RepoProfile, RepoUnit } from '../src/model/repoProfile';
import { detectRepoProfile, suggestChecks } from '../src/repoProfile';
import { PROFILE_LIMITS } from '../src/repoProfile/limits';
import { memoryRepoFiles } from './fakes/memoryRepoFiles';
import { profileRepoFiles } from './fakes/profileRepoFiles';

const profileOf = (name: string, extra?: Record<string, string>) => detectRepoProfile(profileRepoFiles(name, extra));
const unitAt = (p: RepoProfile, dir: string, ecosystem?: string) =>
  p.units.find((u) => u.dir === dir && (!ecosystem || u.ecosystem === ecosystem)) as RepoUnit;
const runs = (u: RepoUnit) => u.commands.map((c) => `${c.role}: ${c.run.join(' ')}`);
const suggested = (p: RepoProfile) => suggestChecks(p).map((s) => `${s.name}: ${s.run.join(' ')} in ${s.cwd || '.'}`);

describe('repo profile: Node', () => {
  it('an npm workspace: members in their folders, the root installs, CI, services and variable names', async () => {
    const p = await profileOf('node-npm-workspaces');
    expect(p.layout).toBe('workspace');
    expect(p.listed).toBe(true);
    expect(p.units.map((u) => u.dir)).toEqual(['', 'apps/web', 'packages/ui']);
    const root = unitAt(p, '');
    expect(root).toMatchObject({ manager: 'npm', lockfile: 'package-lock.json', install: ['npm', 'ci'] });
    expect(root.toolchain).toEqual({ name: 'node', version: '20.11.1', from: '.nvmrc' });
    const web = unitAt(p, 'apps/web');
    expect(web.memberOf).toBe('');
    expect(web.install).toBeUndefined();
    expect(runs(web)).toEqual(['test: npm test', 'lint: npm run lint']);
    expect(web.commands.every((c) => c.cwd === 'apps/web')).toBe(true);
    expect(web.needs).toEqual([{ kind: 'browser', name: 'karma', why: 'karma in apps/web/package.json' }]);
    expect(runs(unitAt(p, 'packages/ui'))).toEqual(['test: npm test', 'typecheck: npm run typecheck']);
    expect(p.workspaceTools.map((t) => t.tool)).toEqual(['npm', 'turbo']);
    expect(p.agentDocs).toEqual(['AGENTS.md']);
    expect(p.ci.map((h) => h.run?.join(' ') ?? `(${h.line})`)).toEqual([
      'npm ci',
      'npm test',
      '(npm run lint && npm run build)',
      '(echo done)',
    ]);
    expect(p.needs).toContainEqual({
      kind: 'service',
      name: 'postgres',
      why: 'postgres:16-alpine in .github/workflows/ci.yml',
    });
    const stripe = p.needs.find((n) => n.name === 'STRIPE_SECRET_KEY');
    expect(stripe).toMatchObject({ kind: 'variable', secretShaped: true });
    expect(p.needs).toContainEqual({
      kind: 'variable',
      name: 'LOG_LEVEL',
      secretShaped: false,
      why: 'listed in .env.example',
    });
  });

  it('never keeps a value from an env example, and never reads .env itself', async () => {
    const files = profileRepoFiles('node-npm-workspaces', { '.env': 'DATABASE_URL=postgres://real:pw@prod/db\n' });
    const p = await detectRepoProfile(files);
    expect(JSON.stringify(p)).not.toContain('postgres://localhost/shop');
    expect(JSON.stringify(p)).not.toContain('real:pw');
    expect(files.reads).not.toContain('.env');
  });

  it('pnpm: the workspace file, its exclusions and packageManager', async () => {
    const p = await profileOf('node-pnpm');
    expect(unitAt(p, '')).toMatchObject({ manager: 'pnpm', install: ['pnpm', 'install', '--frozen-lockfile'] });
    expect(unitAt(p, 'packages/api')).toMatchObject({ manager: 'pnpm', memberOf: '' });
    expect(runs(unitAt(p, 'packages/api'))).toEqual(['test: pnpm test']);
    expect(unitAt(p, 'packages/api').needs[0]).toMatchObject({ kind: 'service', name: 'docker' });
    expect(unitAt(p, 'packages/legacy').memberOf).toBeUndefined();
    expect(p.layout).toBe('multi');
  });

  it('yarn berry, bun, and a build when the only test script is npm’s placeholder', async () => {
    const yarn = await profileOf('node-yarn');
    expect(unitAt(yarn, '').install).toEqual(['yarn', 'install', '--immutable']);
    expect(runs(unitAt(yarn, ''))).toEqual([
      'test: yarn test',
      'typecheck: yarn run type-check',
      'format: yarn run format:check',
    ]);
    expect(unitAt(yarn, '').needs[0]).toMatchObject({ kind: 'browser', name: '@playwright/test' });
    const bun = await profileOf('node-bun');
    expect(runs(unitAt(bun, ''))).toEqual(['test: bun run test']);
    expect(unitAt(bun, '').install).toEqual(['bun', 'install', '--frozen-lockfile']);
    const placeholder = await profileOf('node-placeholder');
    expect(runs(unitAt(placeholder, ''))).toEqual(['build: npm run build']);
  });

  it('nx over npm workspaces', async () => {
    const p = await profileOf('node-nx');
    expect(p.workspaceTools.map((t) => t.tool)).toEqual(['npm', 'nx']);
    expect(suggested(p)).toEqual(['site-test: npm test in apps/site']);
  });
});

describe('repo profile: other stacks', () => {
  it('Python with uv, poetry, pipenv and pip', async () => {
    const uv = unitAt(await profileOf('python-uv'), '');
    expect(uv).toMatchObject({ manager: 'uv', lockfile: 'uv.lock', install: ['uv', 'sync', '--frozen'] });
    expect(uv.toolchain).toEqual({ name: 'python', version: '3.12', from: '.python-version' });
    expect(runs(uv)).toEqual([
      'test: uv run --frozen pytest',
      'lint: uv run --frozen ruff check .',
      'typecheck: uv run --frozen mypy .',
    ]);
    const poetry = unitAt(await profileOf('python-poetry'), '');
    expect(poetry).toMatchObject({ manager: 'poetry', toolchain: { version: '^3.10' } });
    expect(runs(poetry)).toEqual(['test: poetry run pytest', 'typecheck: poetry run mypy .']);
    expect(runs(unitAt(await profileOf('python-pipenv'), ''))).toEqual(['test: pipenv run pytest']);
    const pip = unitAt(await profileOf('python-pip'), '');
    expect(pip).toMatchObject({ manager: 'pip', manifest: 'requirements.txt' });
    expect(runs(pip)).toEqual(['test: python -m pytest']);
    expect(pip.needs[0]).toMatchObject({ kind: 'browser', name: 'playwright' });
  });

  it('Go modules in a go.work', async () => {
    const p = await profileOf('go-work');
    expect(p.units.map((u) => [u.dir, u.memberOf])).toEqual([
      ['svc/a', ''],
      ['svc/b', ''],
    ]);
    expect(unitAt(p, 'svc/a').toolchain).toMatchObject({ version: '1.22.3' });
    expect(runs(unitAt(p, 'svc/a'))).toEqual(['test: go test ./...', 'lint: go vet ./...', 'lint: golangci-lint run']);
    expect(unitAt(p, 'svc/b').needs[0]).toMatchObject({ name: 'docker' });
    expect(suggested(p).slice(0, 3)).toEqual([
      'a-test: go test ./... in svc/a',
      'a-lint: go vet ./... in svc/a',
      'a-golangci-lint: golangci-lint run in svc/a',
    ]);
  });

  it('a Cargo workspace is tested from its root, members carry no commands', async () => {
    const p = await profileOf('rust-workspace');
    expect(unitAt(p, '').toolchain).toEqual({ name: 'rust', version: '1.78.0', from: 'rust-toolchain.toml' });
    expect(runs(unitAt(p, ''))).toEqual([
      'test: cargo test --locked',
      'lint: cargo clippy --locked -- -D warnings',
      'format: cargo fmt --check',
    ]);
    expect(unitAt(p, 'crates/core')).toMatchObject({ memberOf: '', commands: [] });
    expect(unitAt(p, 'crates/core').needs[0]).toMatchObject({ name: 'docker' });
  });

  it('Gradle and Maven, through their wrappers', async () => {
    const gradle = await profileOf('jvm-gradle');
    expect(runs(unitAt(gradle, ''))).toEqual(['test: ./gradlew test', 'check: ./gradlew check']);
    expect(unitAt(gradle, '').toolchain).toMatchObject({ name: 'java', version: '21' });
    expect(unitAt(gradle, 'libs/core').memberOf).toBe('');
    const maven = await profileOf('jvm-maven');
    expect(runs(unitAt(maven, ''))).toEqual(['test: ./mvnw test -B', 'check: ./mvnw verify -B']);
    expect(unitAt(maven, '').toolchain).toMatchObject({ version: '17' });
    expect(unitAt(maven, 'service').memberOf).toBe('');
    // the wrappers are known check shapes (guides/knownChecks.ts)
    expect(suggestChecks(maven).every((s) => s.known)).toBe(true);
    expect(suggestChecks(gradle).every((s) => s.known)).toBe(true);
  });

  it('Ruby, PHP and .NET', async () => {
    const ruby = unitAt(await profileOf('ruby'), '');
    expect(ruby).toMatchObject({ manager: 'bundler', toolchain: { version: '3.3.1' } });
    expect(runs(ruby)).toEqual(['test: bundle exec rspec', 'lint: bundle exec rubocop']);
    expect(ruby.needs[0]).toMatchObject({ kind: 'browser' });
    const php = unitAt(await profileOf('php'), '');
    expect(runs(php)).toEqual(['test: vendor/bin/phpunit', 'lint: vendor/bin/phpstan analyse']);
    expect(php.toolchain).toMatchObject({ name: 'php', version: '^8.2' });
    const dotnet = await profileOf('dotnet');
    expect(runs(unitAt(dotnet, ''))).toEqual(['test: dotnet test']);
    expect(unitAt(dotnet, '').toolchain).toMatchObject({ version: '8.0.100' });
    expect(unitAt(dotnet, 'tests/Api.Tests').memberOf).toBe('');
    expect(runs(unitAt(dotnet, 'tools/Gen'))).toEqual(['build: dotnet build']);
  });

  it('unrelated units, a Makefile, compose services and mise pins', async () => {
    const p = await profileOf('polyglot');
    expect(p.layout).toBe('multi');
    expect(unitAt(p, 'web').toolchain).toEqual({ name: 'node', version: '22', from: 'mise.toml' });
    expect(runs(unitAt(p, 'api'))).toContain('test: make test');
    expect(unitAt(p, 'api').needs).toContainEqual({
      kind: 'variable',
      name: 'REDIS_URL',
      secretShaped: false,
      why: 'listed in api/.env.example',
    });
    expect(p.needs.map((n) => n.name)).toEqual(['redis', 'postgres']);
    expect(p.agentDocs).toEqual(['CLAUDE.md']);
  });
});

describe('repo profile: bounds and determinism', () => {
  it('gives the same profile and basis for the same files, and another basis when one changes', async () => {
    const a = await profileOf('node-npm-workspaces');
    const b = await profileOf('node-npm-workspaces');
    expect(b).toEqual(a);
    expect(a.basis).toMatch(/^sha256:[0-9a-f]{64}$/);
    const changed = await profileOf('node-npm-workspaces', { 'apps/web/.nvmrc': '22\n' });
    expect(changed.basis).not.toBe(a.basis);
  });

  it('skips dependency, build and dot folders, and stops at the depth limit', async () => {
    const deep = `${['a', 'b', 'c', 'd', 'e'].join('/')}/package.json`;
    const p = await detectRepoProfile(
      memoryRepoFiles({
        'package.json': '{"scripts":{"test":"vitest"}}',
        'node_modules/x/package.json': '{"scripts":{"test":"t"}}',
        '.cache/y/package.json': '{}',
        'dist/package.json': '{}',
        'a/b/c/d/package.json': '{}',
        [deep]: '{}',
      }),
    );
    expect(p.units.map((u) => u.dir)).toEqual(['', 'a/b/c/d']);
  });

  it('lists at most the folder limit, and says it was cut short', async () => {
    const files: Record<string, string> = {};
    for (let i = 0; i < PROFILE_LIMITS.folders + 20; i++) files[`p${String(i).padStart(4, '0')}/go.mod`] = 'module x\n';
    const p = await detectRepoProfile(memoryRepoFiles(files));
    expect(p.truncated).toBe(true);
    expect(p.units.length).toBeLessThanOrEqual(PROFILE_LIMITS.units);
  });

  it('skips files over the size limit', async () => {
    const big = JSON.stringify({ scripts: { test: 'x' }, pad: 'x'.repeat(PROFILE_LIMITS.textBytes) });
    const p = await detectRepoProfile(memoryRepoFiles({ 'package.json': big }));
    expect(unitAt(p, '').commands).toEqual([]);
  });

  it('without a listing, reads the top folder only', async () => {
    const files = profileRepoFiles('node-npm-workspaces');
    const p = await detectRepoProfile({ read: files.read, kind: files.kind });
    expect(p.listed).toBe(false);
    expect(p.units.map((u) => u.dir)).toEqual(['']);
    expect(p.ci).toEqual([]);
  });

  it('suggests only argv the check lint accepts, named by folder and role', async () => {
    const p = await profileOf('node-npm-workspaces');
    expect(suggested(p)).toEqual([
      'test: npm test in .',
      'lint: npm run lint in .',
      'web-test: npm test in apps/web',
      'web-lint: npm run lint in apps/web',
      'ui-test: npm test in packages/ui',
      'ui-typecheck: npm run typecheck in packages/ui',
    ]);
    expect(suggestChecks(p).every((s) => s.known)).toBe(true);
    // a known tool through `uv run --frozen` or `bundle exec` passes the check lint, so it's offered as known
    expect(suggested(await profileOf('python-uv'))).toEqual([
      'test: uv run --frozen pytest in .',
      'lint: uv run --frozen ruff check . in .',
      'typecheck: uv run --frozen mypy . in .',
    ]);
    expect(suggested(await profileOf('ruby'))).toEqual([
      'test: bundle exec rspec in .',
      'lint: bundle exec rubocop in .',
    ]);
    expect(suggestChecks(await profileOf('ruby')).every((s) => s.known)).toBe(true);
  });
});
