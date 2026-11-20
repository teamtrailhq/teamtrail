import { describe, expect, it } from 'vitest';
import type { CheckFinding, RepoFiles } from '../src/model/checkScreening';
import { screenChecks } from '../src/verification/screenChecks';
import { fixtureRepoFiles } from './fakes/fixtureRepoFiles';

type Seen = Omit<CheckFinding, 'check'>;

async function screen(files: RepoFiles, run: string, cwd?: string): Promise<Seen[]> {
  const found = await screenChecks({ checks: [{ name: 'c', run: run.split(' '), cwd }], files });
  return found.map(({ check: _check, ...f }) => f);
}

const local = (stack: string, extra?: Record<string, string>) => fixtureRepoFiles(stack, { extra, seesInstalls: true });

describe('screening per stack: not installed', () => {
  it('says `ng` is not installed when npm test runs ng and apps/web has no node_modules (the fresh clone)', async () => {
    expect(await screen(local('node-angular'), 'npm test', 'apps/web')).toEqual([
      {
        severity: 'wont-run',
        cause: 'not-installed',
        text: "`ng` isn't installed: no node_modules in `apps/web` or above it; install the dependencies first (`npm ci` in `apps/web`)",
      },
    ]);
    const partly = local('node-angular', { 'apps/web/node_modules/.bin/vite': '' });
    expect((await screen(partly, 'npm run lint', 'apps/web'))[0].text).toMatch(
      /no `node_modules\/\.bin\/ng` in `apps\/web` or above it/,
    );
    const installed = local('node-angular', { 'apps/web/node_modules/.bin/ng': '' });
    expect(await screen(installed, 'npm test', 'apps/web')).toEqual([]);
  });

  it('keeps "no such script" apart from "not installed", and says nothing about installs it cannot see', async () => {
    const [missing] = await screen(local('node-angular'), 'npm run e2e', 'apps/web');
    expect(missing).toEqual({ severity: 'wont-run', text: 'No `e2e` script in package.json in `apps/web`' });
    // a repo read from GitHub never shows node_modules: a hosted run installs before its checks
    expect(await screen(fixtureRepoFiles('node-angular'), 'npm test', 'apps/web')).toEqual([]);
  });

  it('says a program named by its path into a dependency folder is not installed, with the install for it', async () => {
    expect(await screen(local('python-uv'), '.venv/bin/pytest -q')).toEqual([
      {
        severity: 'wont-run',
        cause: 'not-installed',
        text: "`.venv/bin/pytest` isn't installed: no `.venv`; install the dependencies first (`uv sync --frozen`)",
      },
    ]);
    expect(await screen(fixtureRepoFiles('python-uv'), '.venv/bin/pytest -q')).toEqual([]);
    expect((await screen(local('php'), 'vendor/bin/phpunit'))[0]).toMatchObject({
      cause: 'not-installed',
      text: expect.stringContaining('(`composer install`)'),
    });
    expect((await screen(local('php'), 'composer exec phpunit'))[0].cause).toBe('not-installed');
    expect(await screen(local('php', { 'vendor/bin/phpunit': '' }), 'vendor/bin/phpunit')).toEqual([]);
    expect((await screen(local('php'), 'php vendor/bin/phpunit'))[0].cause).toBe('not-installed');
  });

  it('npx and pnpm exec: a dependency that is not installed will not run', async () => {
    const [f] = await screen(local('node-angular'), 'npx --no ng test', 'apps/web');
    expect(f).toMatchObject({ severity: 'wont-run', cause: 'not-installed' });
    expect(
      await screen(local('node-angular', { 'apps/web/node_modules/.bin/ng': '' }), 'npx ng test', 'apps/web'),
    ).toEqual([]);
  });
});

describe('screening per stack: workspaces', () => {
  it('reads the package -w names, by folder or by name', async () => {
    const repo = fixtureRepoFiles('npm-workspaces');
    expect(await screen(repo, 'npm test -w packages/ui')).toEqual([]);
    expect(await screen(repo, 'npm test -w @acme/ui')).toEqual([]);
    expect(await screen(repo, 'npm --workspace=@acme/ui run typecheck')).toEqual([
      { severity: 'wont-run', text: 'No `typecheck` script in package.json in `packages/ui`' },
    ]);
    expect(await screen(repo, 'npm run typecheck -w packages/ui --if-present')).toEqual([]);
    expect(await screen(repo, 'npm run typecheck --workspaces')).toEqual([]);
    // a package whose folder is named otherwise can't be placed without listing folders: nothing said
    expect(await screen(repo, 'npm run typecheck -w @acme/server')).toEqual([]);
    expect(await screen(repo, 'npm test --prefix packages/nope')).toEqual([
      { severity: 'wont-run', text: 'No folder `packages/nope`' },
    ]);
  });

  it('reads pnpm --filter and yarn workspace the same way', async () => {
    const repo = fixtureRepoFiles('pnpm-turbo');
    expect(await screen(repo, 'pnpm --filter web test')).toEqual([]);
    expect(await screen(repo, 'pnpm --filter ./apps/web lint')).toEqual([]);
    expect(await screen(repo, 'pnpm --filter web... run typecheck')).toEqual([
      { severity: 'wont-run', text: 'No `typecheck` script in package.json in `apps/web`' },
    ]);
    expect((await screen(repo, 'yarn workspace web e2e'))[0].severity).toBe('unsure');
  });

  it('reads turbo tasks and says when turbo or nx is not installed', async () => {
    expect(await screen(fixtureRepoFiles('pnpm-turbo'), 'turbo run test lint')).toEqual([]);
    expect(await screen(fixtureRepoFiles('pnpm-turbo'), 'turbo run e2e')).toEqual([
      { severity: 'unsure', text: "No `e2e` task in turbo.json; a package's turbo.json may add it" },
    ]);
    expect((await screen(local('pnpm-turbo'), 'turbo run test'))[0]).toMatchObject({
      cause: 'not-installed',
      text: expect.stringContaining('`pnpm install --frozen-lockfile`'),
    });
    // npm test runs `turbo run test`, so it needs turbo installed too
    expect((await screen(local('pnpm-turbo'), 'pnpm test'))[0].cause).toBe('not-installed');
    expect(await screen(local('pnpm-turbo', { 'node_modules/.bin/turbo': '' }), 'turbo run test')).toEqual([]);
    expect(await screen(fixtureRepoFiles('rust'), 'turbo run test')).toEqual([
      { severity: 'wont-run', text: 'No turbo.json' },
    ]);
    expect(await screen(local('nx', { 'node_modules/.bin/nx': '' }), 'nx test web')).toEqual([]);
    expect((await screen(local('nx'), 'nx run web:test'))[0].cause).toBe('not-installed');
    expect((await screen(fixtureRepoFiles('rust'), 'nx test web'))[0].severity).toBe('unsure');
  });

  it('reads bun: its own test runner, scripts that may be files', async () => {
    const repo = fixtureRepoFiles('bun');
    expect(await screen(repo, 'bun test')).toEqual([]);
    expect(await screen(repo, 'bun run lint')).toEqual([]);
    expect((await screen(repo, 'bun run typecheck'))[0].severity).toBe('unsure');
  });
});

describe('screening per stack: project files and wrappers', () => {
  const ok: [stack: string, run: string, cwd?: string][] = [
    ['python-uv', 'uv run --frozen pytest -q'],
    ['python-uv', 'uv run --locked ruff check .'],
    ['python-uv', 'uv run --frozen python -m pytest'],
    ['python-poetry', 'poetry run pytest'],
    ['python-pipenv', 'pipenv run pytest'],
    ['go', 'go test ./...', 'svc'],
    ['rust', 'cargo test --locked'],
    ['gradle', './gradlew --no-daemon test'],
    ['gradle', 'gradle test', 'core'],
    ['maven', './mvnw -B verify'],
    ['maven', 'mvn -B test'],
    ['ruby', 'bundle exec rspec'],
    ['ruby', 'bundle exec rake test'],
    ['ruby', 'rake'],
    ['php', 'composer test'],
    ['php', 'php artisan test'],
    ['swift', 'swift test'],
    ['elixir', 'mix test'],
    ['dart', 'dart test'],
    ['deno', 'deno test'],
    ['dotnet', 'dotnet test'],
  ];
  it.each(ok)('%s: `%s` can run', async (stack, run, cwd) => {
    expect(await screen(fixtureRepoFiles(stack), run, cwd)).toEqual([]);
  });

  const missing: [stack: string, run: string, text: string][] = [
    ['python-poetry', 'uv run --frozen pytest', 'No uv.lock, which `uv run --frozen` installs from'],
    ['go', 'poetry run pytest', 'No pyproject.toml'],
    ['go', 'pipenv run pytest', 'No Pipfile'],
    ['php', 'bundle exec rspec', 'No Gemfile'],
    ['rust', 'gradle test', 'No build.gradle or settings.gradle'],
    ['gradle', 'mvn test', 'No pom.xml'],
    ['dart', 'mix test', 'No mix.exs'],
    ['elixir', 'swift test', 'No Package.swift'],
    ['swift', 'dart test', 'No pubspec.yaml'],
    ['php', 'rake test', 'No Rakefile'],
    ['php', 'composer run-script lint', 'No `lint` script in composer.json'],
    ['ruby', 'tox -e py312', 'No tox.ini'],
    ['rust', './gradlew test', 'No `gradlew`'],
  ];
  it.each(missing)('%s: `%s` won’t run', async (stack, run, text) => {
    expect(await screen(fixtureRepoFiles(stack), run)).toEqual([{ severity: 'wont-run', text }]);
  });

  it('checks a build wrapper’s own files and the folder Maven reads', async () => {
    const noJar = fixtureRepoFiles('gradle');
    const files = { ...noJar, kind: async (rel: string) => (rel.endsWith('.jar') ? undefined : noJar.kind(rel)) };
    expect(await screen(files, './gradlew test')).toEqual([
      { severity: 'wont-run', text: 'No `gradle/wrapper/gradle-wrapper.jar` for gradlew' },
    ]);
    expect(await screen(fixtureRepoFiles('maven', { extra: { 'web/x.txt': '' } }), 'mvn test', 'web')).toEqual([
      { severity: 'wont-run', text: 'No pom.xml in `web`' },
    ]);
    expect(
      await screen(fixtureRepoFiles('maven', { extra: { 'web/x.txt': '' } }), 'mvn -f ../pom.xml test', 'web'),
    ).toEqual([]);
    expect(await screen(fixtureRepoFiles('go'), 'go test ./...')).toEqual([
      { severity: 'unsure', text: 'No go.mod here; go.work lists the modules, so only paths into them run' },
    ]);
  });

  it('screens the tool a wrapper runs as a check of its own', async () => {
    expect(await screen(fixtureRepoFiles('python-uv'), 'uv run --frozen node scripts/missing.mjs')).toEqual([
      { severity: 'wont-run', text: 'No `scripts/missing.mjs`' },
    ]);
    expect((await screen(fixtureRepoFiles('ruby'), 'bundle exec make nope'))[0].text).toBe('No Makefile');
  });
});

describe('screening: a program outside the repo', () => {
  it('is never read as the tool it is named after', async () => {
    const outside = (argv0: string) => ({
      severity: 'unsure',
      text: `\`${argv0}\` is outside the repo: Teamtrail can't tell what it runs`,
    });
    // pytest would find pyproject.toml here; /tmp/x/pytest is not pytest
    expect(await screen(fixtureRepoFiles('python-uv'), '/tmp/x/pytest -q')).toEqual([outside('/tmp/x/pytest')]);
    expect(await screen(fixtureRepoFiles('python-uv'), '../x/pytest -q')).toEqual([outside('../x/pytest')]);
    expect(await screen(fixtureRepoFiles('python-uv'), 'uv run --frozen ../x/pytest')).toEqual([
      outside('../x/pytest'),
    ]);
    // a path into the repo's tool folders is still screened as what it is
    expect((await screen(local('python-uv'), '.venv/bin/pytest'))[0].cause).toBe('not-installed');
  });
});
