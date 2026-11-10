import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../../agents/agentLink';
import { readJsonFile, writeJsonAtomic } from '../../lib/jsonFile';
import type { AcceptedEntry } from './settingsInForce';
import type { AcceptedStore } from './settingsLedger';

/*
 * The settings this machine accepted for each issue of a remote tracker:
 *   <tracker dir>/.agents/tracker-settings/<kind>-<target>.json   `{ v: 1, issues: { <issue id>: AcceptedEntry } }`
 * Local and never committed: it is this machine's record of what its human set, so nothing a teammate pulls or an
 * agent writes into the tracker can change it. Read on every use: the Lookout and each MCP server share it.
 */
export const ACCEPTED_DIR = `${AGENTS_DIR}/tracker-settings`;

interface Doc {
  v: 1;
  issues: Record<string, AcceptedEntry>;
}

const isEntry = (e: unknown): e is AcceptedEntry => !!e && typeof e === 'object' && !Array.isArray(e);

function readDoc(file: string): Record<string, AcceptedEntry> {
  const raw = readJsonFile<Doc>(file);
  if (raw?.v !== 1 || !raw.issues || typeof raw.issues !== 'object') return {};
  return Object.fromEntries(Object.entries(raw.issues).filter(([, e]) => isEntry(e)));
}

export function acceptedSettingsFile(root: string, key: string): AcceptedStore {
  const file = path.join(root, ACCEPTED_DIR, `${key}.json`);
  return {
    read: () => readDoc(file),
    put(entries) {
      const ignore = path.join(root, AGENTS_DIR, '.gitignore');
      mkdirSync(path.dirname(file), { recursive: true });
      if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
      writeJsonAtomic(file, { v: 1, issues: { ...readDoc(file), ...entries } } satisfies Doc);
    },
  };
}
