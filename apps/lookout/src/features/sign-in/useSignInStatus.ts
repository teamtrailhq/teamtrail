import { BRAND } from '@teamtrail/core';
import { useEffect, useState } from 'react';

export type SignInStatus =
  | { kind: 'checking' }
  | { kind: 'signed-in' }
  /** No Lookout server behind the page (a static build, a demo): nothing to sign in to. */
  | { kind: 'no-server' }
  | { kind: 'signed-out'; local: boolean };

/** Whether this browser is paired with the Lookout (`GET /session`, the one API read open before pairing). */
export async function fetchSignInStatus(): Promise<SignInStatus> {
  try {
    const r = await fetch(`${BRAND.apiPrefix}/session`, { cache: 'no-store' });
    if (!r.ok) return { kind: 'no-server' };
    const s = (await r.json()) as { signedIn?: unknown; local?: unknown };
    if (typeof s.signedIn !== 'boolean') return { kind: 'no-server' };
    return s.signedIn ? { kind: 'signed-in' } : { kind: 'signed-out', local: s.local === true };
  } catch {
    return { kind: 'no-server' };
  }
}

/** The page's sign-in status, asked once when it loads. */
export function useSignInStatus() {
  const [status, setStatus] = useState<SignInStatus>({ kind: 'checking' });
  useEffect(() => void fetchSignInStatus().then(setStatus), []);
  return status;
}
