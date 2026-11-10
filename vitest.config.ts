import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // node:test suites, run by `npm test -w @teamtrail/core` (packages/core/test/run.mjs)
    exclude: ['**/node_modules/**', '**/*.node.test.ts'],
    testTimeout: 20_000,
    // Tests never use the credentials of whoever runs them: no `gh` login, no token from the shell.
    env: { TEAMTRAIL_NO_GH_CLI: '1', GITHUB_TOKEN: '', GH_TOKEN: '', LINEAR_API_KEY: '' },
  },
});
