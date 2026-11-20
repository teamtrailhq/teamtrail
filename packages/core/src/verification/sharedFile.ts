/** Lockfiles, wherever they are: one changes what every package that installs from it runs. */
const LOCKFILES = new Set([
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
  'deno.lock',
  'uv.lock',
  'poetry.lock',
  'Pipfile.lock',
  'pdm.lock',
  'Cargo.lock',
  'go.sum',
  'go.work',
  'go.work.sum',
  'Gemfile.lock',
  'composer.lock',
  'packages.lock.json',
  'gradle.lockfile',
  'mix.lock',
  'pubspec.lock',
  'flake.lock',
]);

/** Files at the repo's top that set up the whole repo: manifests, workspaces, toolchain pins, shared tool config. */
const TOP_FILES = [
  /^package\.json$/,
  /^pnpm-workspace\.yaml$/,
  /^\.npmrc$/,
  /^\.yarnrc(\.yml)?$/,
  /^(turbo|nx|lerna|rush)\.json$/,
  /^tsconfig(\..+)?\.json$/,
  /^(\.eslintrc(\..+)?|eslint\.config\..+|\.prettierrc(\..+)?|prettier\.config\..+|biome\.jsonc?)$/,
  /^(babel|jest|vitest|vite|karma|playwright|cypress)\.config\..+$/,
  /^(pyproject\.toml|setup\.(cfg|py)|requirements.*\.txt|Pipfile|tox\.ini|noxfile\.py|pytest\.ini|conftest\.py)$/,
  /^(go\.mod|Cargo\.toml|Gemfile|composer\.json|pom\.xml|mix\.exs|pubspec\.yaml|deno\.jsonc?|Package\.swift)$/,
  /^(build|settings)\.gradle(\.kts)?$/,
  /^gradle\.properties$/,
  /^(Directory\.Build\.(props|targets)|Directory\.Packages\.props|global\.json|.+\.sln)$/,
  /^(\.nvmrc|\.node-version|\.python-version|\.ruby-version|\.java-version|\.tool-versions|mise\.toml|\.mise\.toml)$/,
  /^rust-toolchain(\.toml)?$/,
  /^(Makefile|GNUmakefile|justfile|Taskfile\.ya?ml|Dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$/,
  /^(\.env(\..+)?)$/,
];

/** Continuous integration: what the team runs on every push. */
const CI = [
  /^\.github\//,
  /^\.gitlab-ci\.yml$/,
  /^\.gitlab\//,
  /^\.circleci\//,
  /^\.buildkite\//,
  /^azure-pipelines\.ya?ml$/,
  /^Jenkinsfile$/,
  /^bitbucket-pipelines\.yml$/,
  /^\.travis\.yml$/,
];

/**
 * Whether a changed file is shared by every part of a monorepo, so a change to it runs every check whatever their
 * `paths` say: any lockfile, the top folder's manifests, workspace files, toolchain pins and shared tool config, and
 * CI config. `file` is relative to the folder the checks' folders are relative to.
 */
export function sharedFile(file: string): boolean {
  const name = file.split('/').pop() ?? file;
  if (LOCKFILES.has(name)) return true;
  if (CI.some((r) => r.test(file))) return true;
  return !file.includes('/') && TOP_FILES.some((r) => r.test(file));
}
