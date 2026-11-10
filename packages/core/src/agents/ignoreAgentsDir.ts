import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from './agentLink';

/** Keeps `.agents/` out of git even when the file about to be written is the first one there. */
export function ignoreAgentsDir(root: string) {
  const ignore = path.join(root, AGENTS_DIR, '.gitignore');
  mkdirSync(path.dirname(ignore), { recursive: true });
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
}
