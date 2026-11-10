/** What the limits need to know about a live session. */
export interface Countable {
  tokenId: string;
  /** Calls being answered now (not the notification stream). */
  calls: number;
  lastCall: number;
}

/**
 * Whether one more session fits, and what to close for it. A token over its own cap gives up its longest-idle
 * session, so a client that reconnects in a loop only ever displaces itself; with none idle, or with the server
 * full, the new session is refused. The server-wide cap is far above any one token's, so one token can't use up
 * what the others need to get in.
 */
export function admit<S extends Countable>(
  sessions: Iterable<[string, S]>,
  at: { tokenId: string; perToken: number; total: number },
): { kind: 'ok'; evict?: [string, S] } | { kind: 'refused'; why: string } {
  const all = [...sessions];
  const own = all.filter(([, s]) => s.tokenId === at.tokenId);
  if (own.length < at.perToken) {
    if (all.length < at.total) return { kind: 'ok' };
    return { kind: 'refused', why: 'Too many sessions. Try again when one has ended.' };
  }
  const idle = own.filter(([, s]) => s.calls === 0).sort((a, b) => a[1].lastCall - b[1].lastCall)[0];
  if (idle) return { kind: 'ok', evict: idle };
  return { kind: 'refused', why: `This token already has ${at.perToken} sessions at work. End one first.` };
}
