import type { RunnerConfig } from './runnerConfig';
import { STACK_RUNNER_CONFIGS } from './stackRunnerConfigs';

const JS = '[cm]?[jt]s';
const named = (stem: string, ext = JS) => new RegExp(`^${stem}\\.(?:${ext})$`);
const PYPROJECT = /^pyproject\.toml$/;
const SETUP_CFG = /^setup\.cfg$/;
const TOX = /^tox\.ini$/;

const VITE: RunnerConfig = {
  files: [named('vitest\\.(config|workspace)'), named('vite\\.config'), /^vitest\.workspace\.json$/],
};
/** pytest's settings, and coverage's (a lowered `fail_under` weakens `pytest --cov`). */
const PYTEST: RunnerConfig = {
  files: [/^pytest\.ini$/, /^conftest\.py$/, /^\.coveragerc$/],
  sections: [
    { file: PYPROJECT, header: /^\[tool\.(pytest|coverage)(\.|\])/ },
    { file: SETUP_CFG, header: /^\[(tool:pytest|coverage:\w+)\]/ },
    { file: TOX, header: /^\[pytest\]/ },
  ],
};
const ESLINT: RunnerConfig = {
  files: [named('eslint\\.config'), /^\.eslintrc(\.(c?js|ya?ml|json))?$/, /^\.eslintignore$/],
  pkgKeys: ['eslintConfig'],
};

/**
 * The test runners, linters and type checkers the guard knows, by the program name a check or script runs (the other
 * stacks' in stackRunnerConfigs.ts). A tool it doesn't know adds nothing; the trail lead names its files in the
 * check's `guards`.
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
  // a project.json counts by the targets the check runs (checkReach.ts), not as a whole
  nx: { files: [/^nx\.json$/] },
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
  rspec: { files: [/^\.rspec(-local)?$/, /^spec_helper\.rb$/, /^rails_helper\.rb$/] },
  phpunit: { files: [/^phpunit\.xml(\.dist)?$/] },
  golangci: { files: [/^\.golangci\.(ya?ml|toml|json)$/] },
  'golangci-lint': { files: [/^\.golangci\.(ya?ml|toml|json)$/] },
  ...STACK_RUNNER_CONFIGS,
};
