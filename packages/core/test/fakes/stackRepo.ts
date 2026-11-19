import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STACKS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'check-stacks');

function readAll(dir: string, prefix: string, out: Record<string, string>) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (statSync(full).isDirectory()) readAll(full, rel, out);
    else out[rel] = readFileSync(full, 'utf8');
  }
  return out;
}

/** One of the per-stack fixture repos (test/fixtures/check-stacks/<stack>): repo-relative path → text. */
export function stackRepo(stack: string): Record<string, string> {
  return readAll(path.join(STACKS, stack), '', {});
}
