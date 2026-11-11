import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './jsonFile';

/**
 * Creates a local-only folder of the tracker folder (`.agents/`, `.events/`, `.evidence/`, …) and keeps it out of
 * git with its own `.gitignore` of `*`, which hides the folder and the ignore file itself. Every writer of local
 * state goes through here, so `git add .teamtrail` never offers session docs, leases or evidence. The file is put
 * back to exactly `*` if anything else was written there.
 */
const RULE = '*\n';

export function ensureLocalDir(dir: string) {
  mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  let text = '';
  try {
    text = readFileSync(ignore, 'utf8');
  } catch {
    // missing: written below
  }
  // exactly the one rule: a line taken out, or a `!` added after it to un-ignore part of the folder, is undone
  if (text !== RULE) writeFileSync(ignore, RULE);
}

/** Writes `<root>/<rel>` atomically; `rel` starts with a local-only folder, which is git-ignored first. */
export function writeLocalJson(root: string, rel: string, value: unknown) {
  ensureLocalDir(path.join(root, rel.split(/[\\/]/)[0]));
  writeJsonAtomic(path.join(root, rel), value);
}
