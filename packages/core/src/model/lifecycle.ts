import type { ModelMatching } from './types';

/**
 * Ticket lifecycle. The tracker stores open/closed, the assignee and, on top
 * of those, a `TicketStatus` (frontmatter `status`, or the issue meta marker).
 * Everything the UI and agents see is the derived `TicketPhase`
 * (planning/lifecycle/phase.ts), and only `transition()` changes it.
 */

/** Stored status of an open ticket; absent means the phase follows from the assignee and blockers. */
export type TicketStatus = 'verifying' | 'rework' | 'blocked';

export const TICKET_STATUSES: TicketStatus[] = ['verifying', 'rework', 'blocked'];

/**
 * User-facing phase. `backlog` waits on blockers (or is parked on a plan-only
 * trail); `blocked` waits on a human.
 */
export type TicketPhase = 'backlog' | 'ready' | 'working' | 'verifying' | 'rework' | 'blocked' | 'done' | 'cancelled';

export const TICKET_PHASES: TicketPhase[] = [
  'backlog',
  'ready',
  'working',
  'verifying',
  'rework',
  'blocked',
  'done',
  'cancelled',
];

export type LifecycleEvent =
  | 'claim'
  | 'release'
  | 'expire'
  | 'complete'
  | 'submit'
  | 'checks.pass'
  | 'checks.fail'
  | 'checks.error'
  | 'reverify'
  | 'review.pass'
  | 'review.fail'
  | 'review.needs_human'
  | 'approve'
  | 'reject'
  | 'accept'
  | 'unblock'
  | 'cancel'
  | 'reopen';

/**
 * How much evidence a completion needs before the ticket is done. Trails
 * without a level are `off`: completing closes the ticket, as always.
 */
export type VerificationLevel = 'off' | 'checks' | 'checks+review' | 'checks+review+human';

export const VERIFICATION_LEVELS: VerificationLevel[] = ['off', 'checks', 'checks+review', 'checks+review+human'];

/** `v` as a level, when it is one (stored values are read leniently). */
export const levelOf = (v: unknown) => VERIFICATION_LEVELS.find((l) => l === v);

/** `engine`: Teamtrail itself (lease reaper, check runner, reconciler). */
export type ActorKind = 'agent' | 'trail lead' | 'engine';

/** Teamtrail fields stored with a ticket besides assignment and closing. `null` clears a field. */
export interface TicketMetaPatch {
  /** Only `transition()` writes this. */
  status?: TicketStatus | null;
  /** Trail lead only (`setVerification`). */
  verification?: VerificationLevel | null;
  checks?: string[] | null;
  /** Set once, when Teamtrail creates a review ticket. */
  reviewOf?: string | null;
  /** The ticket's guide; set at creation, or by the trail lead (`setTicketGuide`). */
  guide?: string | null;
}

/** Teamtrail fields stored with a trail. `null` clears a field. */
export interface MapMetaPatch {
  /** Trail lead only (`setVerification`). */
  verification?: VerificationLevel | null;
  /** The trail's team of guide ids (`setTrailTeam`). */
  guides?: string[] | null;
  /** Trail lead only (`setModelMatching`). */
  modelMatching?: ModelMatching | null;
}

/** One line of a trail's history (`.events/<mapId>.jsonl`). History and UI only; the tracker holds the state. */
export interface TransitionEntry {
  v: 1;
  kind: 'transition';
  at: number;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  event: LifecycleEvent;
  from: TicketPhase;
  to: TicketPhase;
  /** Actor id: an agent trail name, `trail lead`, `teamtrail`. */
  actor: string;
  actorKind: ActorKind;
  reason?: string;
  sessionId?: string;
}

export type RerouteAction = 'proposed' | 'approved' | 'rejected' | 'applied' | 'superseded';

/** A reroute proposal's step, in the same history file as transitions. Readers skip kinds they don't know. */
export interface RerouteEntry {
  v: 1;
  kind: 'reroute';
  at: number;
  mapId: string;
  rerouteId: string;
  action: RerouteAction;
  actor: string;
  actorKind: ActorKind;
  /** The proposal's reason (proposed) or the trail lead's note (approved, rejected). */
  reason?: string;
  /** How many changes the proposal carries (proposed) or executed (applied). */
  changes?: number;
}

export type GuideAction = 'approved' | 'installed' | 'updated' | 'removed' | 'check-approved' | 'ticket-guide' | 'team';

/**
 * A trail lead's change to guides, in the same history files. Project-wide changes (install, approve, remove) go to
 * the `GUIDES_JOURNAL` file; a ticket's guide and a trail's team go to that trail's.
 */
export interface GuideEntry {
  v: 1;
  kind: 'guide';
  at: number;
  mapId: string;
  action: GuideAction;
  /** The guide id, or the team's ids joined with ", ". */
  guide: string;
  version?: string;
  ticketId?: string;
  /** A check the trail lead approved, by name. */
  check?: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** The journal "trail" that holds project-wide guide changes. */
export const GUIDES_JOURNAL = '_guides';

export type RemoteAgentAction = 'token-created' | 'token-revoked';

/**
 * The trail lead opening or closing a remote agent's access (Settings → Project → Remote agents), in the project-wide
 * `REMOTE_AGENTS_JOURNAL` file. Never holds the token or its hash: only the token's id and name.
 */
export interface RemoteAgentEntry {
  v: 1;
  kind: 'remote-agent';
  at: number;
  mapId: string;
  action: RemoteAgentAction;
  tokenId: string;
  /** The name the trail lead gave the agent. */
  name: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** The journal "trail" that holds remote agents' token changes. */
export const REMOTE_AGENTS_JOURNAL = '_remote-agents';

export type JournalEntry = TransitionEntry | RerouteEntry;

/** Where transitions are recorded: a JSONL file in node, the lookout server from the browser, nowhere in demos. */
export interface Journal {
  append(entry: TransitionEntry): void | Promise<void>;
}
