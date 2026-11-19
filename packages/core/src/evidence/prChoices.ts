import type { CiProvider, PrChoice, PullRequestSnapshot } from '../model/prEvidence';
import { readAttempts } from '../verification/evidenceStore';
import { ticketRefs } from './attemptRefs';
import { ticketRef } from './github/prText';
import { readTicketSync } from './syncStore';

const MAX = 30;
const STATE_RANK: Record<PrChoice['state'], number> = { open: 0, merged: 1, closed: 2 };

const choiceOf = (pr: PullRequestSnapshot, forTicket: boolean): PrChoice => ({
  number: pr.number,
  url: pr.url,
  title: pr.title,
  state: pr.state,
  draft: pr.draft,
  headRef: pr.headRef,
  updatedAt: pr.updatedAt,
  forTicket,
});

const order = (a: PrChoice, b: PrChoice) =>
  Number(b.forTicket) - Number(a.forTicket) ||
  STATE_RANK[a.state] - STATE_RANK[b.state] ||
  b.updatedAt - a.updatedAt ||
  b.number - a.number;

/** The branch the ticket's work is on: its newest attempt's, else the head of the PR it was linked to. */
function branchOf(at: { root: string; mapId: string; ticketId: string }): string | undefined {
  const refs = ticketRefs(readAttempts(at.root, at.mapId, at.ticketId));
  return refs.branch ?? readTicketSync(at.root, at.mapId, at.ticketId)?.pr?.headRef;
}

/**
 * The pull requests the trail lead can link a ticket to: the repo's open and recently updated ones (one call) and,
 * when the ticket's branch is known, that branch's (one more). The ticket's own come first: on its branch, or naming
 * it in a body marker or branch name. At most 30.
 */
export async function prChoices(i: {
  root: string;
  mapId: string;
  ticketId: string;
  provider: CiProvider;
}): Promise<PrChoice[]> {
  const branch = branchOf(i);
  const ref = ticketRef(i.mapId, i.ticketId);
  const byNumber = new Map<number, PrChoice>();
  for (const c of await i.provider.recent()) {
    const mine = c.markers.includes(ref) || (!!branch && c.pr.sameRepo && c.pr.headRef === branch);
    byNumber.set(c.pr.number, choiceOf(c.pr, mine));
  }
  if (branch) for (const pr of await i.provider.forBranch(branch)) byNumber.set(pr.number, choiceOf(pr, true));
  return [...byNumber.values()].sort(order).slice(0, MAX);
}
