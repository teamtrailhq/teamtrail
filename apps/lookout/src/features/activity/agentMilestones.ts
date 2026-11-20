import type { ActivityState } from '@teamtrail/core';

type Session = ActivityState['sessions'][number];
type Entry = ActivityState['feed'][number];

/** The moments of an agent's work the Activity page shows; everything else an agent reports stays off it. */
export type MilestoneKind = 'claimed' | 'asked' | 'answered' | 'submitted' | 'rework' | 'verified';

export interface Milestone {
  kind: MilestoneKind;
  at: number;
  /** An `asked` the agent still waits on: the only one shown as needing you. */
  open?: boolean;
}

/** How many milestones a lane keeps, the latest ones: a lane is a glance, not a history. */
export const LANE_MILESTONES = 6;

/** What `submit` writes to the feed (packages/cli/src/mcp/trail/completion.ts: "<key> submitted · checks: …"). */
const SUBMITTED = / submitted · checks:/;

/**
 * One agent session's milestones, oldest first, from the activity feed: claimed (the session started on a
 * ticket), asked and answered (its questions), submitted (a completion), and how verification came back
 * (verified, or rework when checks failed). Verification lines carry the ticket, not the session, so they count
 * from the session's start on, for its ticket only. Pure.
 */
export function agentMilestones(o: { session: Session; feed: Entry[] }): Milestone[] {
  const { session } = o;
  const out: Milestone[] = [];
  if (session.ticketId) out.push({ kind: 'claimed', at: session.startedAt });
  const asked: Milestone[] = [];
  for (const e of o.feed) {
    const kind = kindOf(e, session);
    if (!kind) continue;
    const m: Milestone = { kind, at: e.at };
    if (kind === 'asked') asked.push(m);
    out.push(m);
  }
  const last = asked.at(-1);
  if (last && session.waitingOn) last.open = true;
  return out.sort((a, b) => a.at - b.at).slice(-LANE_MILESTONES);
}

function kindOf(e: Entry, s: Session): MilestoneKind | undefined {
  const mine = e.sessionId === s.id;
  // A question (sessionHandle.ts `ask`) is the one asks-you line marked as a signal; other asks-you lines are notes.
  if (mine && e.kind === 'asks-you' && e.signal) return 'asked';
  if (mine && e.kind === 'answered') return 'answered';
  if (mine && e.level === 'step' && SUBMITTED.test(e.text)) return 'submitted';
  const onTicket = !!s.ticketId && e.ticketId === s.ticketId && e.at >= s.startedAt && e.source === 'system';
  if (onTicket && e.kind === 'verified') return 'verified';
  if (onTicket && e.kind === 'checks-failed') return 'rework';
  return undefined;
}
