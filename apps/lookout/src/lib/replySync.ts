import type { TicketSync } from '@teamtrail/core';

const STATES = new Set(['open', 'merged', 'closed']);
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * The PR snapshot a server's reply carries for one ticket (a merge's `sync`: the ticket's pull request as the engine
 * now keeps it), when it is one, for that very ticket; undefined otherwise. Only the shape the PR block reads is
 * checked: its text is rendered as plain text and its link through `webUrl`, as every snapshot's is.
 */
export function replySync(value: unknown, o: { mapId: string; ticketId: string }): TicketSync | undefined {
  if (!record(value) || value.v !== 1 || value.mapId !== o.mapId || value.ticketId !== o.ticketId) return undefined;
  const pr = value.pr;
  if (!record(pr) || !Number.isInteger(pr.number) || !STATES.has(String(pr.state))) return undefined;
  if (!record(value.link) || !Array.isArray(value.checks) || !Array.isArray(value.flags)) return undefined;
  return value as unknown as TicketSync;
}
