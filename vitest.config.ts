import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    // node:test suites, run by `npm test -w @teamtrail/core` (packages/core/test/run.mjs)
    exclude: ['**/node_modules/**', '**/*.node.test.ts'],
    testTimeout: 20_000,
    // Tests never use the credentials of whoever runs them: no `gh` login, no token from the shell. Nor their
    // config dir: approvals, the machine key and the projects registry go to a folder of this run.
    env: {
      TEAMTRAIL_NO_GH_CLI: '1',
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
      LINEAR_API_KEY: '',
      TEAMTRAIL_CONFIG_DIR: mkdtempSync(path.join(os.tmpdir(), 'teamtrail-test-config-')),
    },
  },
});
