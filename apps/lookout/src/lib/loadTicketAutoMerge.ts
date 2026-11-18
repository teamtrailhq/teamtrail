import { managedSignIn } from './managedSignIn';
import { type TicketAutoMerge, ticketAutoMergeOf } from './ticketAutoMergeOf';

/**
 * Behind a server that merges verified pull requests itself (managedSignIn.ts `autoMerge`): what it says about one
 * ticket's pull request. Undefined without one (the Lookout on its own) or when it doesn't answer.
 */
export async function loadTicketAutoMerge(at: { trail: string; ticket: string }): Promise<TicketAutoMerge | undefined> {
  const path = managedSignIn()?.autoMerge;
  if (!path) return undefined;
  const q = new URLSearchParams({ trail: at.trail, ticket: at.ticket });
  const r = await fetch(`${path}?${q}`).catch(() => undefined);
  if (!r?.ok) return undefined;
  const body: unknown = await r.json().catch(() => undefined);
  return ticketAutoMergeOf(body, at);
}
