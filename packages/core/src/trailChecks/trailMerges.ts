import type { PullRequestSnapshot } from '../model/prEvidence';
import type { TicketMerge } from '../model/trailChecks';
import type { Ticket, TicketType } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { isObjectId } from '../workspaces/gitNames';

/** Ticket types whose work is code to merge; the others can end with nothing to merge. */
const CODE: TicketType[] = ['prototype', 'task', 'execute'];

const commitOf = (sha: string | undefined) => (sha && isObjectId(sha.toLowerCase()) ? sha.toLowerCase() : undefined);

interface MergeInput {
  ticket: Pick<Ticket, 'id' | 'key' | 'type'>;
  /** The ticket's pull request as the PR sync last read it. */
  pr?: PullRequestSnapshot;
  /** The ticket's latest completion. */
  attempt?: Pick<VerificationAttempt, 'git'>;
}

/** Without a pull request: the verified commit, when the completion changed files in git. */
function fromAttempt(o: MergeInput): TicketMerge {
  const base = { ticketId: o.ticket.id, key: o.ticket.key };
  const git = o.attempt?.git;
  const commit = commitOf(git?.tree?.head ?? undefined);
  if (git && git.stats.files === 0) return { ...base, state: 'nothing' };
  if (commit && git) return { ...base, state: 'merged', commit };
  return { ...base, state: CODE.includes(o.ticket.type) ? 'unknown' : 'nothing' };
}

/**
 * How one done ticket's work reaches the default branch, from what was recorded (pure): its pull request's state and
 * merge commit when the PR sync read one, else the commit its completion was verified on. The commit is what a run
 * on main must contain for the trail to count as verified together.
 */
function ticketMerge(o: MergeInput): TicketMerge {
  const pr = o.pr;
  if (!pr) return fromAttempt(o);
  const base = { ticketId: o.ticket.id, key: o.ticket.key, pr: pr.number };
  if (pr.state === 'open') return { ...base, state: 'open' };
  if (pr.state === 'closed') return { ...base, state: 'closed' };
  // a squash or rebase merge puts other commits on main: the merge commit is the one to look for
  const commit = commitOf(pr.mergeCommit) ?? commitOf(o.attempt?.git?.tree?.head ?? undefined);
  return commit ? { ...base, state: 'merged', commit } : { ...base, state: 'unknown' };
}

/** Each ticket closed as completed, in the trail's order; tickets ruled out and open ones are not merges. */
export function trailMerges(o: {
  tickets: Pick<Ticket, 'id' | 'key' | 'type' | 'state' | 'closeReason'>[];
  pr: (ticketId: string) => PullRequestSnapshot | undefined;
  attempt: (ticketId: string) => MergeInput['attempt'];
}): TicketMerge[] {
  return o.tickets
    .filter((t) => t.state === 'closed' && t.closeReason === 'completed')
    .map((t) => ticketMerge({ ticket: t, pr: o.pr(t.id), attempt: o.attempt(t.id) }));
}
