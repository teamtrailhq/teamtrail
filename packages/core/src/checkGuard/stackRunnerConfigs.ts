import type { RunnerConfig } from './runnerConfig';

const PYPROJECT = /^pyproject\.toml$/;
const SETUP_CFG = /^setup\.cfg$/;

/** Cargo reads its profiles, test targets and lints from Cargo.toml, and settings from `.cargo/config.toml`. */
const CARGO: RunnerConfig = {
  files: [/^\.?clippy\.toml$/, /^\.?rustfmt\.toml$/, /^rust-toolchain(\.toml)?$/],
  paths: [/(^|\/)\.cargo\/config(\.toml)?$/, /(^|\/)\.config\/nextest\.toml$/],
  sections: [
    {
      file: /^Cargo\.toml$/,
      header: /^\[(\[(test|bench)\]\]|profile(\.|\])|(workspace\.)?lints(\.|\])|lib\])/,
    },
  ],
};
/** Gradle builds are code: every build script, its properties, the wrapper's distribution, convention plugins. */
const GRADLE: RunnerConfig = {
  files: [/\.gradle(\.kts)?$/, /^gradle\.properties$/],
  paths: [/(^|\/)gradle\/wrapper\/gradle-wrapper\.properties$/, /(^|\/)buildSrc\//, /(^|\/)gradle\/[\w.-]+\.toml$/],
};
const MAVEN: RunnerConfig = {
  files: [/^pom\.xml$/],
  paths: [/(^|\/)\.mvn\/(maven|jvm)\.config$/, /(^|\/)\.mvn\/extensions\.xml$/, /(^|\/)\.mvn\/wrapper\/[\w.-]+$/],
};
const DOTNET: RunnerConfig = {
  files: [
    /\.(cs|fs|vb)proj$/,
    /\.slnx?$/,
    /^Directory\.Build\.(props|targets)$/,
    /\.runsettings$/,
    /^global\.json$/,
    /^\.editorconfig$/,
    /^xunit\.runner\.json$/,
  ],
};
const PHPUNIT: RunnerConfig = { files: [/^phpunit(\.dist)?\.xml(\.dist)?$/, /^Pest\.php$/] };
const PYRIGHT: RunnerConfig = {
  files: [/^pyrightconfig\.json$/],
  sections: [{ file: PYPROJECT, header: /^\[tool\.(based)?pyright(\.|\])/ }],
};
const DART: RunnerConfig = { files: [/^analysis_options\.yaml$/, /^dart_test\.yaml$/] };

/**
 * The runners and linters of the stacks other than JavaScript and Python's own test runners: Rust, the JVM, .NET,
 * Ruby, PHP, Swift, Elixir, Dart, and Python's type checkers and formatters. Merged into RUNNER_CONFIGS.
 */
export const STACK_RUNNER_CONFIGS: Record<string, RunnerConfig> = {
  cargo: CARGO,
  'cargo-nextest': CARGO,
  gradle: GRADLE,
  gradlew: GRADLE,
  mvn: MAVEN,
  mvnw: MAVEN,
  dotnet: DOTNET,
  rubocop: { files: [/^\.rubocop(_todo|-[\w-]+)?\.ya?ml$/] },
  standardrb: { files: [/^\.standard(_todo)?\.ya?ml$/] },
  rake: { files: [/^[Rr]akefile(\.rb)?$/, /\.rake$/, /^test_helper\.rb$/] },
  rails: { files: [/^test_helper\.rb$/, /^application_system_test_case\.rb$/] },
  phpunit: PHPUNIT,
  pest: PHPUNIT,
  phpstan: { files: [/^phpstan(\.dist)?\.neon(\.dist)?$/, /^phpstan-baseline\.(neon|php)$/] },
  psalm: { files: [/^psalm(\.dist)?\.xml(\.dist)?$/, /^psalm-baseline\.xml$/] },
  phpcs: { files: [/^\.?phpcs\.xml(\.dist)?$/] },
  'php-cs-fixer': { files: [/^\.php-cs-fixer(\.dist)?\.php$/] },
  pint: { files: [/^pint\.json$/] },
  pyright: PYRIGHT,
  basedpyright: PYRIGHT,
  pylint: {
    files: [/^\.?pylintrc$/],
    sections: [
      { file: PYPROJECT, header: /^\[tool\.pylint(\.|\])/ },
      { file: SETUP_CFG, header: /^\[pylint/ },
    ],
  },
  black: { files: [], sections: [{ file: PYPROJECT, header: /^\[tool\.black\]/ }] },
  isort: {
    files: [/^\.isort\.cfg$/],
    sections: [
      { file: PYPROJECT, header: /^\[tool\.isort\]/ },
      { file: SETUP_CFG, header: /^\[isort\]/ },
    ],
  },
  uv: { files: [/^uv\.toml$/], sections: [{ file: PYPROJECT, header: /^\[tool\.uv(\.|\])/ }] },
  swift: { files: [/^Package\.swift$/] },
  swiftlint: { files: [/^\.swiftlint\.ya?ml$/] },
  mix: { files: [/^mix\.exs$/, /^\.formatter\.exs$/, /^\.credo\.exs$/, /^test_helper\.exs$/] },
  dart: DART,
  flutter: DART,
  deno: { files: [/^deno\.jsonc?$/] },
  bun: { files: [/^bunfig\.toml$/] },
  ng: { files: [/^angular\.json$/, /^karma\.conf\.[cm]?[jt]s$/] },
  detekt: { files: [/^detekt(-config)?\.ya?ml$/] },
  ktlint: { files: [/^\.editorconfig$/] },
  stylelint: { files: [/^\.stylelintrc(\.\w+)?$/, /^stylelint\.config\.[cm]?[jt]s$/], pkgKeys: ['stylelint'] },
};
