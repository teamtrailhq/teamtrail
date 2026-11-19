import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { memoryRepoFiles } from './memoryRepoFiles';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures/repo-profile');

/** One of the committed fixture repos (test/fixtures/repo-profile/<name>) as RepoFiles, plus files added in memory. */
export function fixtureRepoFiles(name: string, extra: Record<string, string> = {}) {
  const top = path.join(FIXTURES, name);
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else files[path.relative(top, full).split(path.sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(top);
  return memoryRepoFiles({ ...files, ...extra });
}
