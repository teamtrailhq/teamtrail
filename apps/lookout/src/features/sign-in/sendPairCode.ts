import { BRAND } from '@teamtrail/core';
import { keepSession } from '../../lib/session';

/**
 * Pairs this browser with a code (`POST /pair`, from the Lookout's own page) and keeps the session the server sends
 * back in this origin's storage, with its id and the verifier the page checks the server with from then on. Resolves to an error message, or undefined once paired.
 */
export async function sendPairCode(code: string): Promise<string | undefined> {
  const r = await fetch(`${BRAND.apiPrefix}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).catch(() => undefined);
  if (!r) return 'The Lookout didn’t answer. Try again.';
  const reply = (await r.json().catch(() => ({}))) as {
    error?: string;
    id?: string;
    session?: string;
    verifier?: string;
  };
  if (!r.ok) return reply.error ?? 'That code didn’t work. Get a new one.';
  if (reply.id && reply.session && reply.verifier)
    keepSession({ id: reply.id, secret: reply.session, verifier: reply.verifier });
  return undefined;
}
