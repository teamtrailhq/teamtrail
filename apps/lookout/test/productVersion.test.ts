import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { RELEASES } from '../src/features/settings/releases';

const cli = JSON.parse(readFileSync(new URL('../../../packages/cli/package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// The Release workflow stamps a pre-release suffix on the package before it runs the checks (0.24.1-next.33), so
// compare the version without it.
test('the newest changelog release is the product version on npm', () => {
  expect(RELEASES[0].version).toBe(cli.version.split('-')[0]);
});
