import type { CheckSuggestion } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { checkPaths } from '../src/lib/checkPaths';
import { openSuggestions } from '../src/lib/openSuggestions';
import { rowOfSuggestion } from '../src/lib/rowOfSuggestion';

const suggestion = (name: string, run: string, cwd = ''): CheckSuggestion => ({
  name,
  run: run.split(' '),
  cwd,
  role: 'test',
  ecosystem: 'node',
  from: 'package.json scripts.test',
  known: true,
});

describe('suggested checks in the editor', () => {
  const web = suggestion('web-test', 'npm test', 'apps/web');
  const top = suggestion('test', 'npm test');

  it('offers what no row has yet, by command and folder', () => {
    expect(openSuggestions([top, web], [])).toEqual([top, web]);
    expect(openSuggestions([top, web], [{ command: 'npm  test', cwd: '' }])).toEqual([web]);
    expect(openSuggestions([top, web], [{ command: 'npm test', cwd: './apps/web/' }])).toEqual([top]);
    expect(openSuggestions([top, web], [{ command: 'npm test', cwd: 'apps/api' }])).toEqual([top, web]);
  });

  it('offers at most eight', () => {
    const many = Array.from({ length: 12 }, (_, i) => suggestion(`t${i}`, `npm test`, `p${i}`));
    expect(openSuggestions(many, [])).toHaveLength(8);
  });

  it('adds a suggestion as a row with its folder, numbering a name already taken', () => {
    expect(rowOfSuggestion(web, [])).toEqual({ name: 'web-test', command: 'npm test', cwd: 'apps/web', paths: '' });
    expect(rowOfSuggestion(web, [{ name: 'web-test' }, { name: 'web-test-2' }]).name).toBe('web-test-3');
  });

  it("prefills a monorepo package's paths, and reads typed paths back as a list", () => {
    const scoped = { ...web, paths: ['apps/web/**'] };
    expect(rowOfSuggestion(scoped, []).paths).toBe('apps/web/**');
    expect(checkPaths(' apps/web/**,  packages/ui/** apps/web/** ')).toEqual(['apps/web/**', 'packages/ui/**']);
    expect(checkPaths('  ')).toEqual([]);
  });
});
