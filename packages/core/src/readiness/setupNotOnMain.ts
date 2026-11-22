import { readTicketSync } from '../evidence/syncStore';
import type { MapSnapshot } from '../model/types';
import { webUrl } from '../model/webUrl';

/** A trail's setup work that is done but not on the default branch yet: its ticket, and its pull request when known. */
export interface SetupNotOnMain {
  key: string;
  pr?: { number: number; url?: string };
}

/**
 * The trail's setup ticket (model/setupTicket.ts) when it closed as done but its work isn't on the default branch yet:
 * its pull request is still open (PR sync), or, with no pull request known, the default branch still reads as a new
 * repo (`stillNew`). Until it merges, checks on main and readiness read a repo with no project, so the rest of the
 * trail waits on that merge, not on anything the trail lead or an agent can choose.
 */
export function setupNotOnMain(o: { root: string; snap: MapSnapshot; stillNew?: boolean }): SetupNotOnMain | undefined {
  const t = o.snap.tickets.find((x) => x.setup);
  if (!t || t.state !== 'closed' || t.closeReason !== 'completed') return undefined;
  const pr = readTicketSync(o.root, o.snap.map.id, t.id)?.pr;
  if (pr?.state === 'merged') return undefined;
  if (pr?.state === 'open') return { key: t.key, pr: { number: pr.number, ...urlOf(pr.url) } };
  return o.stillNew ? { key: t.key } : undefined;
}

function urlOf(url: string | undefined) {
  const safe = url ? webUrl(url) : undefined;
  return safe ? { url: safe } : {};
}
