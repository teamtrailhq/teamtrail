import { mkdirSync, statSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { SignInFile, StoredPairCode, StoredSignIn } from '../model/signIn';

/*
 * The Lookout's paired browsers and waiting pairing codes, in the machine store of the folder it was started in:
 *   <config dir>/projects/<project id>/sign-in.json     0600, in a 0700 folder
 * Only hashes: reading this file signs nobody in. `teamtrail pair` adds a code here while the Lookout runs; the
 * Lookout reads it again whenever it changed. Every change is made under a file lock.
 */
export const SIGN_IN_FILE = 'sign-in.json';

const EMPTY: SignInFile = { v: 1, sessions: [], codes: [] };

const isSession = (s: unknown): s is StoredSignIn => {
  const x = s as StoredSignIn;
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.hash === 'string' &&
    /^[0-9a-f]{64}$/.test(x.hash) &&
    (x.kind === 'machine' || x.kind === 'device') &&
    typeof x.start === 'string' &&
    typeof x.instance === 'number' &&
    typeof x.expiresAt === 'number'
  );
};

const isCode = (c: unknown): c is StoredPairCode => {
  const x = c as StoredPairCode;
  return (
    !!x &&
    typeof x.hash === 'string' &&
    (x.kind === 'machine' || x.kind === 'device') &&
    typeof x.instance === 'number' &&
    typeof x.expiresAt === 'number'
  );
};

export interface SignInPlace {
  /** The tracker folder the Lookout was started in. */
  root: string;
  /** The user config dir; default as everywhere (`$TEAMTRAIL_CONFIG_DIR`, XDG, `~/.config/teamtrail`). */
  configDir?: string;
}

/** What the file holds now; nothing when it's missing or unreadable. Entries of the wrong shape are dropped. */
export function readSignIns(at: SignInPlace): SignInFile {
  const raw = machineStore(at.root, at.configDir).read<Partial<SignInFile>>(SIGN_IN_FILE);
  if (!raw || raw.v !== 1) return { ...EMPTY };
  return {
    v: 1,
    sessions: Array.isArray(raw.sessions) ? raw.sessions.filter(isSession) : [],
    codes: Array.isArray(raw.codes) ? raw.codes.filter(isCode) : [],
  };
}

/** Changes the file under its lock; `change` gets what is there now and returns the new contents and a result. */
export function updateSignIns<T>(at: SignInPlace, change: (now: SignInFile) => { file: SignInFile; result: T }): T {
  const store = machineStore(at.root, at.configDir);
  mkdirSync(store.dir, { recursive: true, mode: 0o700 });
  return withFileLock(store.file(`${SIGN_IN_FILE}.lock`), () => {
    const { file, result } = change(readSignIns(at));
    store.write(SIGN_IN_FILE, file);
    return result;
  });
}

/** Which version of the file is there (every write replaces it), so a reader knows to read it again. */
export function signInsVersion(at: SignInPlace): string {
  try {
    const s = statSync(machineStore(at.root, at.configDir).file(SIGN_IN_FILE));
    return `${s.ino}:${s.mtimeMs}:${s.size}`;
  } catch {
    return 'none';
  }
}
