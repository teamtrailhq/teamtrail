import { randomBytes } from 'node:crypto';

/** A ticket opens one event stream, within half a minute of being made. */
const TICKET_MS = 30_000;
const MAX_TICKETS = 500;

/**
 * Single-use tickets for `/events`. A browser's EventSource can't send the session header, so the page asks for a
 * ticket with the header first (`POST /sign-in/stream`) and opens the stream with `?ticket=`. A ticket is random,
 * short-lived, used once and tied to its session, so it is no session in a URL.
 */
export function streamTickets(now: () => number) {
  const tickets = new Map<string, { sessionId: string; until: number }>();
  return {
    issue(sessionId: string) {
      for (const [t, v] of tickets) if (v.until <= now() || tickets.size > MAX_TICKETS) tickets.delete(t);
      const ticket = randomBytes(24).toString('base64url');
      tickets.set(ticket, { sessionId, until: now() + TICKET_MS });
      return ticket;
    },
    /** The session a ticket was made for; the ticket is gone after this, whatever it was. */
    take(ticket: string | null): string | undefined {
      if (!ticket) return undefined;
      const found = tickets.get(ticket);
      tickets.delete(ticket);
      return found && found.until > now() ? found.sessionId : undefined;
    },
  };
}
