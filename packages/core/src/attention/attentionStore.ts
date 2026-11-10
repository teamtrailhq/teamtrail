import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { AttentionPolicy, AttentionPrefs, AttentionState } from '../model/attention';
import { parseJsonSafe } from '../model/safeKey';
import { configDir } from '../server/trackerConfig';
import { ATTENTION_FILE, EMPTY_ATTENTION_STATE } from './defaults';
import { parseAttentionPolicy, type Parsed } from './parsePolicy';
import { parseAttentionPrefs } from './parsePrefs';

const STATE_DIR = '.attention';
const STATE_FILE = 'state.json';

export interface AttentionPolicyRead extends Parsed<AttentionPolicy> {
  file: string;
  exists: boolean;
}

/** The team's `attention.json` in the tracker folder; missing means the defaults, with no errors. */
export function readAttentionPolicy(root: string): AttentionPolicyRead {
  const file = path.join(root, ATTENTION_FILE);
  if (!existsSync(file)) return { file: ATTENTION_FILE, exists: false, ...parseAttentionPolicy({ v: 1 }) };
  let raw: unknown;
  try {
    raw = parseJsonSafe(readFileSync(file, 'utf8'));
  } catch (err) {
    const parsed = parseAttentionPolicy({ v: 1 });
    return { file: ATTENTION_FILE, exists: true, value: parsed.value, errors: [`not valid JSON: ${String(err)}`] };
  }
  return { file: ATTENTION_FILE, exists: true, ...parseAttentionPolicy(raw) };
}

/** This person's prefs from their config dir (never a repo); bad or missing files give the defaults. */
export function readAttentionPrefs(dir = configDir()): AttentionPrefs {
  return parseAttentionPrefs(readJsonFile(path.join(dir, ATTENTION_FILE)) ?? {}).value;
}

/** Validates and saves this person's prefs; returns the errors instead of saving when there are any. */
export function writeAttentionPrefs(raw: unknown, dir = configDir()): Parsed<AttentionPrefs> {
  const parsed = parseAttentionPrefs(raw);
  if (!parsed.errors.length) writeJsonAtomic(path.join(dir, ATTENTION_FILE), parsed.value, { private: true });
  return parsed;
}

const stateFile = (root: string) => path.join(root, STATE_DIR, STATE_FILE);

export function readAttentionState(root: string): AttentionState {
  const s = readJsonFile<Partial<AttentionState>>(stateFile(root));
  if (s?.v !== 1) return EMPTY_ATTENTION_STATE;
  return {
    v: 1,
    snoozed: s.snoozed && typeof s.snoozed === 'object' ? s.snoozed : {},
    dismissed: Array.isArray(s.dismissed) ? s.dismissed : [],
    ...(typeof s.lastDigestAt === 'number' ? { lastDigestAt: s.lastDigestAt } : {}),
  };
}

/** Local and gitignored: snoozes are one person's, on one machine. */
function writeAttentionState(root: string, s: AttentionState) {
  const dir = path.join(root, STATE_DIR);
  mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  if (!existsSync(ignore)) writeFileSync(ignore, '*\n');
  writeJsonAtomic(stateFile(root), s);
}

/** Applies one change to the state file and drops snoozes that have run out. */
export function updateAttentionState(
  root: string,
  change: (s: AttentionState) => AttentionState,
  now = Date.now(),
): AttentionState {
  const current = readAttentionState(root);
  const live = Object.fromEntries(Object.entries(current.snoozed).filter(([, until]) => until > now));
  const next = change({ ...current, snoozed: live });
  writeAttentionState(root, next);
  return next;
}
