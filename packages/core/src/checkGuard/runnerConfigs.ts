/**
 * Where a tool reads its config. `files`: config files by name, the whole file counts. `sections`: shared files where
 * only the tool's own section counts (pyproject.toml's `[tool.pytest.ini_options]`), so a dependency added there
 * changes nothing. `pkgKeys`: package.json keys it reads (`jest`).
 */
export interface RunnerConfig {
  files: RegExp[];
  sections?: { file: RegExp; header: RegExp }[];
  pkgKeys?: string[];
}

const JS = '[cm]?[jt]s';
const named = (stem: string, ext = JS) => new RegExp(`^${stem}\\.(?:${ext})$`);
const PYPROJECT = /^pyproject\.toml$/;
const SETUP_CFG = /^setup\.cfg$/;
const TOX = /^tox\.ini$/;

const VITE: RunnerConfig = {
  files: [named('vitest\\.(config|workspace)'), named('vite\\.config'), /^vitest\.workspace\.json$/],
};
const PYTEST: RunnerConfig = {
  files: [/^pytest\.ini$/, /^conftest\.py$/],
  sections: [
    { file: PYPROJECT, header: /^\[tool\.pytest(\.|\])/ },
    { file: SETUP_CFG, header: /^\[tool:pytest\]/ },
    { file: TOX, header: /^\[pytest\]/ },
  ],
};
const ESLINT: RunnerConfig = {
  files: [named('eslint\\.config'), /^\.eslintrc(\.(c?js|ya?ml|json))?$/, /^\.eslintignore$/],
  pkgKeys: ['eslintConfig'],
};

/**
 * The test runners, linters and type checkers the guard knows, by the program name a check or script runs. A tool
 * it doesn't know adds nothing; the trail lead names its files in the check's `guards`.
 */
export const RUNNER_CONFIGS: Record<string, RunnerConfig> = {
  vitest: VITE,
  vite: VITE,
  jest: { files: [named('jest\\.config', `${JS}|json`), named('jest\\.setup')], pkgKeys: ['jest'] },
  playwright: { files: [named('playwright\\.config')] },
  cypress: { files: [named('cypress\\.config')] },
  mocha: { files: [/^\.mocharc(\.(c?js|ya?ml|jsonc?))?$/], pkgKeys: ['mocha'] },
  ava: { files: [named('ava\\.config')], pkgKeys: ['ava'] },
  karma: { files: [/^karma\.conf\.[cm]?[jt]s$/] },
  c8: { files: [/^\.c8rc(\.json)?$/], pkgKeys: ['c8'] },
  nyc: { files: [/^\.nycrc(\.(json|ya?ml))?$/], pkgKeys: ['nyc'] },
  eslint: ESLINT,
  'next-lint': ESLINT,
  tsc: { files: [/^tsconfig(\.[\w-]+)*\.json$/] },
  'vue-tsc': { files: [/^tsconfig(\.[\w-]+)*\.json$/] },
  prettier: {
    files: [/^\.prettierrc(\.\w+)?$/, named('prettier\\.config'), /^\.prettierignore$/],
    pkgKeys: ['prettier'],
  },
  biome: { files: [/^biome\.jsonc?$/] },
  turbo: { files: [/^turbo\.json$/] },
  nx: { files: [/^nx\.json$/, /^project\.json$/] },
  pytest: PYTEST,
  'py.test': PYTEST,
  tox: { files: [TOX, /^conftest\.py$/] },
  nox: { files: [/^noxfile\.py$/] },
  mypy: {
    files: [/^\.?mypy\.ini$/],
    sections: [
      { file: PYPROJECT, header: /^\[tool\.mypy(\.|\])/ },
      { file: SETUP_CFG, header: /^\[mypy(-|\])/ },
    ],
  },
  ruff: { files: [/^\.?ruff\.toml$/], sections: [{ file: PYPROJECT, header: /^\[tool\.ruff(\.|\])/ }] },
  flake8: { files: [/^\.flake8$/], sections: [{ file: SETUP_CFG, header: /^\[flake8\]/ }] },
  rspec: { files: [/^\.rspec$/, /^spec_helper\.rb$/, /^rails_helper\.rb$/] },
  phpunit: { files: [/^phpunit\.xml(\.dist)?$/] },
  golangci: { files: [/^\.golangci\.(ya?ml|toml|json)$/] },
  'golangci-lint': { files: [/^\.golangci\.(ya?ml|toml|json)$/] },
};
