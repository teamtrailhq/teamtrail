import { TrackerError } from '../adapters/remote/http';
import { journalFile } from '../history/journalFile';
import type { CiProvider, PrLinkEntry, PullRequestSnapshot, TicketSync } from '../model/prEvidence';
import type { Ticket } from '../model/types';
import { logFlagChanges } from './reconcile';
import { dropTicketSync, readTicketSync, writeTicketSync } from './syncStore';
import { readUnlinked, writeUnlinked } from './unlinkedStore';

export interface HandLinkInput {
  root: string;
  mapId: string;
  ticket: Ticket;
  /** The PR to link, or null to unlink the one linked now. */
  pr: number | null;
  /** The configured code host, or why there is none; linking reads the PR from it first, unlinking needs none. */
  provider: CiProvider | string;
  now?: number;
}

export type HandLinkResult =
  | { kind: 'linked'; sync: TicketSync }
  | { kind: 'unlinked'; pr?: number }
  | { kind: 'refused'; status: 400 | 409; error: string };

/**
 * The trail lead linking a pull request to a ticket by hand, or unlinking the one it has. A link is checked against
 * the code host first (the PR must exist in the repo) and written at once with what the host said, so the ticket's PR
 * block shows it before the next tick; the reconciler never moves a hand link (findLink.ts). An unlinked PR is never
 * linked again but by hand (unlinkedStore.ts). Both are journaled with the trail's history. Never changes the ticket.
 */
export async function linkPrByHand(i: HandLinkInput): Promise<HandLinkResult> {
  const now = i.now ?? Date.now();
  const prev = readTicketSync(i.root, i.mapId, i.ticket.id);
  if (i.pr === null) return unlink(i, prev, now);
  if (typeof i.provider === 'string')
    return { kind: 'refused', status: 409, error: `PR sync can't read pull requests: ${i.provider}` };
  const pr = await readPull(i.provider, i.pr);
  if (typeof pr === 'string') return { kind: 'refused', status: 400, error: pr };
  const sync = linked({ mapId: i.mapId, ticket: i.ticket, pr, prev, now, host: i.provider.name });
  writeTicketSync(i.root, sync);
  if (prev?.pr?.number !== pr.number) logFlagChanges(i.root, prev, sync, now);
  writeUnlinked(
    i.root,
    at(i),
    readUnlinked(i.root, i.mapId, i.ticket.id).filter((n) => n !== pr.number),
  );
  const was = prev?.link.number;
  journal(i, { action: 'linked', pr: pr.number, ...(was && was !== pr.number ? { was } : {}), at: now });
  return { kind: 'linked', sync };
}

const at = (i: HandLinkInput) => ({ mapId: i.mapId, ticketId: i.ticket.id });

function unlink(i: HandLinkInput, prev: TicketSync | undefined, now: number): HandLinkResult {
  if (!prev) return { kind: 'unlinked' };
  dropTicketSync(i.root, i.mapId, i.ticket.id);
  logFlagChanges(i.root, prev, undefined, now);
  writeUnlinked(i.root, at(i), [...readUnlinked(i.root, i.mapId, i.ticket.id), prev.link.number]);
  journal(i, { action: 'unlinked', pr: prev.link.number, at: now });
  return { kind: 'unlinked', pr: prev.link.number };
}

/** The PR as the host has it now, or why it can't be linked. A rate limit or an outage is thrown, not refused. */
async function readPull(provider: CiProvider, n: number): Promise<PullRequestSnapshot | string> {
  try {
    return await provider.pull(n);
  } catch (e) {
    if (e instanceof TrackerError && e.code === 'not_found')
      return `There is no pull request #${n} in ${provider.repo}.`;
    throw e;
  }
}

/** The ticket's sync with a hand link to `pr`; checks and flags read of the same PR before are kept. */
function linked(i: {
  mapId: string;
  ticket: Ticket;
  pr: PullRequestSnapshot;
  prev?: TicketSync;
  now: number;
  host: string;
}): TicketSync {
  const { prev, pr } = i;
  const base = {
    v: 1 as const,
    mapId: i.mapId,
    ticketId: i.ticket.id,
    ticketKey: i.ticket.key,
    provider: i.host,
    link: { number: pr.number, source: 'explicit' as const, at: i.now },
    pr,
  };
  if (prev?.pr?.number !== pr.number) return { ...base, checks: [], checksSummary: 'none' as const, flags: [] };
  const { checks, checksSummary, flags, syncedAt } = prev;
  return { ...base, checks, checksSummary, flags, ...(syncedAt ? { syncedAt } : {}) };
}

function journal(i: HandLinkInput, e: Pick<PrLinkEntry, 'action' | 'pr' | 'was' | 'at'>) {
  journalFile(i.root).append({
    v: 1,
    kind: 'pr-link',
    mapId: i.mapId,
    ticketId: i.ticket.id,
    ticketKey: i.ticket.key,
    actor: 'trail lead',
    actorKind: 'trail lead',
    ...e,
  });
}
