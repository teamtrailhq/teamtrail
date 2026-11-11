import { readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import type { StoredPairCode } from '../model/signIn';
import { SIGN_IN_REDIRECT } from './signInRedirectFile';
import { findByHash } from './signInSecrets';
import { readSignIns, type SignInPlace } from './signInStore';

/** A temp file is linked into place within moments; one older than this was left by a process that stopped. */
const TMP_MS = 60_000;

function stillPending(o: { file: string; name: string; pending: StoredPairCode[] }) {
  if (!SIGN_IN_REDIRECT.page.test(o.name)) return Date.now() - statSync(o.file).mtimeMs < TMP_MS;
  const code = /#pair=([A-Za-z0-9_-]{43})/.exec(readFileSync(o.file, 'utf8'))?.[1];
  return !!code && !!findByHash(o.pending, code);
}

/**
 * Removes the one-time sign-in pages (writeSignInRedirect.ts) in the machine store: `keep: 'pending'` keeps those
 * whose code still waits to be used (so a used or expired one goes), `keep: 'none'` removes them all (a Lookout
 * starting, after a crash, or stopping).
 */
export function sweepSignInRedirects(at: SignInPlace & { keep: 'pending' | 'none'; now?: number }) {
  const store = machineStore(at.root, at.configDir);
  let names: string[];
  try {
    names = readdirSync(store.dir).filter((n) => SIGN_IN_REDIRECT.any.test(n));
  } catch {
    return;
  }
  if (!names.length) return;
  const now = at.now ?? Date.now();
  const pending = at.keep === 'pending' ? readSignIns(at).codes.filter((c) => c.expiresAt > now) : undefined;
  for (const name of names) {
    const file = store.file(name);
    try {
      const keep = pending ? stillPending({ file, name, pending }) : false;
      if (!keep) rmSync(file, { force: true });
    } catch {
      // gone already, or unreadable: the next sweep tries again
    }
  }
}
