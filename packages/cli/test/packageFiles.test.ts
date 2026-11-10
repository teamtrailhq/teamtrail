import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What `npm publish` ships: the bundle (dist), the docs npm always adds (README, LICENSE, the notices) and
 * package.json. No source maps, sources, tests or dev files: they would publish paths and code that isn't the
 * product, and anything in the tarball runs on users' machines.
 */
const cli = path.resolve(__dirname, '..');
const repo = path.resolve(cli, '../..');

describe('the npm tarball', () => {
  it('package.json "files" lists the bundle and the docs, nothing else', () => {
    const pkg = JSON.parse(readFileSync(path.join(cli, 'package.json'), 'utf8')) as { files: string[] };
    expect(pkg.files).toEqual(['dist', 'THIRD_PARTY_NOTICES.md', 'LICENSE']);
  });

  it.skipIf(!existsSync(path.join(cli, 'dist', 'cli.js')))('holds no source maps, sources or dev files', () => {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '-w', 'teamtrail'], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = (JSON.parse(out) as { files: { path: string }[] }[])[0].files.map((f) => f.path);
    const docs = ['LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.md', 'package.json'];
    const strays = files.filter((f) => !docs.includes(f) && !/^dist\/(cli\.js|app\/)/.test(f));
    expect(strays).toEqual([]);
    expect(files.filter((f) => /\.(map|ts|tsx|test\.\w+)$|(^|\/)\.|node_modules/.test(f))).toEqual([]);
    expect(files).toContain('dist/cli.js');
    expect(readFileSync(path.join(cli, 'dist', 'cli.js'), 'utf8')).not.toMatch(/sourceMappingURL/);
  });
});
