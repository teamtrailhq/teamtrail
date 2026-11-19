import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RepoFiles } from '../../src/model/checkScreening';
import { memoryRepoFiles } from './memoryRepoFiles';

const STACKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'check-stacks');

function readAll(dir: string, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) Object.assign(out, readAll(full, rel));
    else out[rel] = readFileSync(full, 'utf8');
  }
  return out;
}

/**
 * One of the per-stack fixture repos (test/fixtures/check-stacks/<stack>) as screening reads it, with `extra` files
 * on top (what an install would add: `node_modules/.bin/ng`) and `seesInstalls` as a local checkout has it.
 */
export function fixtureRepoFiles(
  stack: string,
  o: { extra?: Record<string, string>; seesInstalls?: boolean } = {},
): RepoFiles & { reads: string[] } {
  const files = memoryRepoFiles({ ...readAll(path.join(STACKS, stack)), ...o.extra });
  return o.seesInstalls ? Object.assign(files, { seesInstalls: true }) : files;
}
