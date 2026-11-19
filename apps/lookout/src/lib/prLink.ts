import type { PrChoice, TicketSync } from '@teamtrail/core';
import { apiBase } from './apiBase';
import { prSync } from './prSync';

const said = (body: { error?: unknown }, status: number) =>
  String(body.error ?? `The server answered ${status}.`).slice(0, 300);

/** The pull requests a ticket can be linked to (`GET /verification/sync/candidates`), or why they can't be read. */
export async function loadPrChoices(at: {
  mapId: string;
  ticketId: string;
}): Promise<{ repo: string; prs: PrChoice[] } | { error: string }> {
  const q = new URLSearchParams(at);
  const r = await fetch(`${apiBase()}/verification/sync/candidates?${q}`).catch(() => undefined);
  if (!r) return { error: "The Lookout's server didn't answer. Try again." };
  const body = (await r.json().catch(() => ({}))) as { repo?: unknown; prs?: unknown; error?: unknown };
  if (!r.ok || typeof body.repo !== 'string' || !Array.isArray(body.prs)) return { error: said(body, r.status) };
  return { repo: body.repo, prs: body.prs as PrChoice[] };
}

/**
 * Links a pull request to a ticket by hand, or unlinks it (`pr: null`), with `PUT /verification/sync/link`. The
 * server checks the PR exists first. What it answers is shown at once (prSync), before the reconciler's next event.
 */
export async function setPrLink(at: { mapId: string; ticketId: string; pr: number | null }): Promise<string | null> {
  const r = await fetch(`${apiBase()}/verification/sync/link`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(at),
  }).catch(() => undefined);
  if (!r) return "The Lookout's server didn't answer. Try again.";
  const body = (await r.json().catch(() => ({}))) as { ticket?: TicketSync | null; error?: unknown };
  if (!r.ok) return said(body, r.status);
  if (body.ticket) prSync.push(body.ticket);
  else prSync.drop(at.mapId, at.ticketId);
  return null;
}
