import { BRAND } from '@teamtrail/core';
import { useEffect, useState } from 'react';
import { onProofChange, proveServer } from '../../lib/serverProof';
import { readSession } from '../../lib/session';

export type SignInStatus =
  | { kind: 'checking' }
  | { kind: 'signed-in' }
  /** No Lookout server behind the page (a static build, a demo): nothing to sign in to. */
  | { kind: 'no-server' }
  | { kind: 'signed-out'; local: boolean }
  /** The server at this address didn't prove it is this browser's Lookout: the session stays here. */
  | { kind: 'not-running' };

/** Whether a Lookout answers here, and whether it is this machine (`GET /session`, open before pairing). */
async function unpaired(): Promise<SignInStatus> {
  try {
    const r = await fetch(`${BRAND.apiPrefix}/session`, { cache: 'no-store' });
    if (!r.ok) return { kind: 'no-server' };
    const s = (await r.json()) as { signedIn?: unknown; local?: unknown };
    if (typeof s.signedIn !== 'boolean') return { kind: 'no-server' };
    return { kind: 'signed-out', local: s.local === true };
  } catch {
    return { kind: 'no-server' };
  }
}

/**
 * The page's sign-in status. A browser with a session first has the server prove it is its Lookout
 * (lib/serverProof.ts): only then does it count as signed in, and only then does the session go out.
 */
export async function fetchSignInStatus(): Promise<SignInStatus> {
  if (!readSession()) return unpaired();
  const proof = await proveServer();
  if (proof === 'proven') return { kind: 'signed-in' };
  if (proof === 'unknown') return unpaired();
  return { kind: 'not-running' };
}

/** The status, asked once when the page loads; a server that stops proving itself later turns it to not running. */
export function useSignInStatus() {
  const [status, setStatus] = useState<SignInStatus>({ kind: 'checking' });
  useEffect(() => void fetchSignInStatus().then(setStatus), []);
  useEffect(() => onProofChange((s) => s === 'failed' && setStatus({ kind: 'not-running' })), []);
  return status;
}
