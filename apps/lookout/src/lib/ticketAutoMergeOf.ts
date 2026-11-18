import { webUrl } from '@teamtrail/core';
import { sameOriginPath } from './sameOriginPath';

/**
 * What the server's auto-merge says about one ticket's pull request, for its PR block: it waits (and why), it merged
 * it (and when), or nothing to say (auto-merge off, or the ticket in neither list).
 */
export type TicketAutoMerge =
  { kind: 'waiting'; why: string; settings?: string } | { kind: 'merged'; at: number; url?: string } | { kind: 'none' };

interface Entry {
  kind: 'waiting' | 'merged';
  at: number;
  why: string;
  url?: string;
}

const WHY_MAX = 300;

/** One list entry, kept only when it is this ticket's and well formed; `why` is the server's text, one line. */
function entryOf(raw: unknown, kind: Entry['kind'], at: { trail: string; ticket: string }): Entry | undefined {
  const e = raw as { trail?: unknown; ticket?: unknown; at?: unknown; why?: unknown; url?: unknown } | null;
  if (!e || e.trail !== at.trail || String(e.ticket) !== at.ticket) return undefined;
  if (typeof e.at !== 'number' || !Number.isFinite(e.at)) return undefined;
  const why = typeof e.why === 'string' ? e.why.replace(/\s+/g, ' ').trim().slice(0, WHY_MAX) : '';
  if (kind === 'waiting' && !why) return undefined;
  return { kind, at: e.at, why, url: webUrl(typeof e.url === 'string' ? e.url : undefined) };
}

const listOf = (value: unknown) => (Array.isArray(value) ? (value as unknown[]) : []);

/**
 * Reads `GET <managed.autoMerge>?trail=<id>&ticket=<n>` for one ticket: the newest of its waiting and merged entries
 * wins (a new pull request can wait after an older one merged). Nothing while auto-merge is off. The settings link
 * stays on this origin; a pull request's link must be a web URL.
 */
export function ticketAutoMergeOf(body: unknown, at: { trail: string; ticket: string }): TicketAutoMerge {
  const b = body as { on?: unknown; merges?: unknown; waiting?: unknown; settings?: unknown } | null;
  if (b?.on !== true) return { kind: 'none' };
  const entries = [
    ...listOf(b.waiting).map((e) => entryOf(e, 'waiting', at)),
    ...listOf(b.merges).map((e) => entryOf(e, 'merged', at)),
  ].filter((e): e is Entry => !!e);
  const newest = entries.sort((x, y) => y.at - x.at)[0];
  if (!newest) return { kind: 'none' };
  if (newest.kind === 'merged') return { kind: 'merged', at: newest.at, url: newest.url };
  return { kind: 'waiting', why: newest.why, settings: sameOriginPath(b.settings) };
}
