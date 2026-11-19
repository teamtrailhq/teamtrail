import type {
  CiProvider,
  PrCandidate,
  PrLink,
  PrLinkSource,
  PullRequestSnapshot,
  TicketSync,
} from '../model/prEvidence';
import type { ticketRefs } from './attemptRefs';
import { ticketRef } from './github/prText';
import { bestPr } from './prPreference';
import { recent, type ReconcileMemo } from './reconcileMemo';

/** What one tick knows, shared by every ticket: the recent PRs by number, by ticket marker and by head branch. */
export interface LinkScope {
  provider: CiProvider;
  recentPrs: Map<number, PullRequestSnapshot>;
  byRef: Map<string, PrCandidate>;
  byBranch: Map<string, PullRequestSnapshot[]>;
  memo?: ReconcileMemo;
  now: number;
}

const RANK: Record<PrLinkSource, number> = { explicit: 4, attempt: 3, branch: 2, marker: 1 };

function strongest(links: (PrLink | undefined)[]): PrLink | undefined {
  let best: PrLink | undefined;
  for (const l of links) if (l && (!best || RANK[l.source] > RANK[best.source])) best = l;
  return best;
}

/** The recent PRs by number, by marker (the preferred one per ticket) and same-repo ones by head branch. */
export function indexRecent(listed: PrCandidate[]) {
  const recentPrs = new Map(listed.map((c) => [c.pr.number, c.pr]));
  const byRef = new Map<string, PrCandidate>();
  const byBranch = new Map<string, PullRequestSnapshot[]>();
  for (const c of listed) {
    for (const ref of c.markers) {
      const had = byRef.get(ref);
      if (!had || bestPr([had.pr, c.pr]) === c.pr) byRef.set(ref, c);
    }
    if (c.pr.sameRepo && c.pr.headRef) byBranch.set(c.pr.headRef, [...(byBranch.get(c.pr.headRef) ?? []), c.pr]);
  }
  return { recentPrs, byRef, byBranch };
}

/**
 * The branch's PR: from the recent PRs when one is there (no call), else asked of the host, at most once an hour per
 * branch while the loop remembers (a done ticket whose branch never got a PR isn't asked about every tick).
 */
async function branchLink(s: LinkScope, branch: string, skip: Set<number>): Promise<PrLink | undefined> {
  const listed = (s.byBranch.get(branch) ?? []).filter((p) => !skip.has(p.number));
  let pick = bestPr(listed);
  if (!pick && !recent(s.memo?.branchAt.get(branch), s.now)) {
    s.memo?.branchAt.set(branch, s.now);
    pick = bestPr((await s.provider.forBranch(branch)).filter((p) => !skip.has(p.number)));
  }
  return pick && { number: pick.number, source: 'branch', at: s.now };
}

export interface FoundLink {
  link?: PrLink;
  /** PRs closed without merging that a newer PR for the ticket replaced (TicketSync.replaced). */
  replaced: number[];
}

type TicketLinkInput = {
  mapId: string;
  ticketId: string;
  prev?: TicketSync;
  refs: ReturnType<typeof ticketRefs>;
  /** PRs the trail lead unlinked from the ticket by hand (unlinkedStore.ts): never linked again but by hand. */
  unlinked?: number[];
};

/** The last link, when it's one the trail lead didn't set by hand and its PR was closed without merging. */
function closedLink(prev: TicketSync | undefined): PrLink | undefined {
  const was = prev?.link;
  if (!was || was.source === 'explicit') return undefined;
  return prev?.pr?.number === was.number && prev.pr.state === 'closed' ? was : undefined;
}

/** The strongest of the attempt's PR, the last link and a marker, leaving out the PRs in `skip`. */
function strongestKnown(s: LinkScope, t: TicketLinkInput, skip: Set<number>): PrLink | undefined {
  const live = (l: PrLink | undefined) => (l && (l.source === 'explicit' || !skip.has(l.number)) ? l : undefined);
  const marked = s.byRef.get(ticketRef(t.mapId, t.ticketId));
  return strongest([
    live(t.refs.pr ? { number: t.refs.pr, source: 'attempt', at: s.now } : undefined),
    live(t.prev?.link),
    live(marked ? { number: marked.pr.number, source: 'marker', at: s.now } : undefined),
  ]);
}

/**
 * The ticket's PR: the strongest of the attempt's PR, the last link, a marker in a PR, and the attempt's branch. A
 * link the trail lead didn't set by hand gives way when its PR was closed without merging and another PR for the
 * ticket is there (a replacement on the same branch, or with the same marker); the closed one is remembered so it
 * never wins back. A PR the trail lead unlinked by hand is never found again here; a hand link is never moved.
 */
export async function findLink(s: LinkScope, t: TicketLinkInput): Promise<FoundLink> {
  const was = t.prev?.link;
  const closed = closedLink(t.prev);
  const kept = [...(t.prev?.replaced ?? [])];
  const skip = new Set([...kept, ...(t.unlinked ?? []), ...(closed ? [closed.number] : [])]);
  let link = strongestKnown(s, t, skip);
  if (t.refs.branch && (!link || RANK[link.source] < RANK.branch))
    link = (await branchLink(s, t.refs.branch, skip)) ?? link;
  if (!link) return { link: was, replaced: kept };
  if (closed && link.number !== closed.number && !kept.includes(closed.number)) kept.push(closed.number);
  const sameAsBefore = was && was.number === link.number && was.source === link.source;
  return { link: sameAsBefore ? was : link, replaced: kept };
}
