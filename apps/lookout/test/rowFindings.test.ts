import { expect, test } from 'vitest';
import { rowFindings, type RowFinding } from '../src/lib/rowFindings';

const finding = (check: string, command: string): RowFinding => ({
  check,
  command,
  severity: 'wont-run',
  text: 'No `nope` script in package.json',
});

test('each row shows the findings about its own command, until kept anyway', () => {
  const findings = [finding('0', 'npm test'), finding('1', 'npm run nope')];
  const rows = [{ command: 'npm test' }, { command: ' npm  run nope ' }];
  expect(rowFindings({ findings, rows, kept: new Set() }).map((f) => f.length)).toEqual([1, 1]);
  // kept anyway: none until the command changes
  expect(rowFindings({ findings, rows, kept: new Set(['npm run nope']) }).map((f) => f.length)).toEqual([1, 0]);
  // a finding about the command a row had before (typing, or a row removed above it) doesn't show on it
  expect(rowFindings({ findings, rows: [{ command: 'npm run nope' }], kept: new Set() })).toEqual([[]]);
});
