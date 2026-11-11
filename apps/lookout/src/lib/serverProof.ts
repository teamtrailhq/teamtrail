import { BRAND } from '@teamtrail/core';
import { fromHex, hex, hmacSha256 } from './hmacSha256';
import { forgetSession, readSession } from './session';

/**
 * Whether the server this page talks to proved it is its Lookout. Until it has, the page sends its session nowhere:
 * a server squatting the Lookout's port once it stopped (an agent's) gets no secret from an open tab.
 *   `proven`: it answered the challenge for this session at this origin.
 *   `unknown`: the Lookout doesn't know the session (revoked, expired, or a new start): the session is forgotten.
 *   `failed`: no answer, or a wrong one: Teamtrail isn't running at this address.
 */
export type ProofState = 'unproven' | 'proven' | 'unknown' | 'failed';

let state: ProofState = 'unproven';
let asking: Promise<ProofState> | undefined;
const listeners = new Set<(s: ProofState) => void>();

const set = (next: ProofState) => {
  state = next;
  for (const l of listeners) l(next);
};

export const proofState = () => state;

export function onProofChange(listener: (s: ProofState) => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The session may go out only now. */
export const serverProven = () => state === 'proven';

/** The connection dropped: until the server proves itself again, nothing carries the session. */
export const distrustServer = () => state === 'proven' && set('unproven');

function nonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return hex(bytes);
}

async function ask(): Promise<ProofState> {
  const session = readSession();
  if (!session) return 'unknown';
  const n = nonce();
  const r = await fetch(`${BRAND.apiPrefix}/session/prove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: session.id, nonce: n }),
  }).catch(() => undefined);
  if (r?.status === 404) return (forgetSession(), 'unknown');
  const proof = r?.ok ? ((await r.json().catch(() => ({}))) as { proof?: unknown }).proof : undefined;
  const expected = hex(hmacSha256(fromHex(session.verifier), new TextEncoder().encode(`${n}\n${location.origin}`)));
  return proof === expected ? 'proven' : 'failed';
}

/** Asks the server to prove itself (once at a time); the session goes out again only on `proven`. */
export function proveServer(): Promise<ProofState> {
  asking ??= ask().then((s) => {
    asking = undefined;
    set(s);
    return s;
  });
  return asking;
}
