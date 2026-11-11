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
  /**
   * Set by the trail lead's own settings actions only: on a remote tracker the settings this write carries count as
   * accepted on this machine (remote/settingsInForce.ts). Every other write leaves what was accepted alone.
   */
  confirm?: true;
}

/** Teamtrail fields stored with a trail. `null` clears a field. */
export interface MapMetaPatch {
  /** Trail lead only (`setVerification`). */
  verification?: VerificationLevel | null;
  /** The trail's team of guide ids (`setTrailTeam`). */
  guides?: string[] | null;
  /** Trail lead only (`setModelMatching`). */
  modelMatching?: ModelMatching | null;
  /**
   * Set by the trail lead's own settings actions only: on a remote tracker the settings this write carries count as
   * accepted on this machine (remote/settingsInForce.ts). Every other write leaves what was accepted alone.
   */
  confirm?: true;
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

export type SignInAction = 'paired' | 'revoked' | 'signed-out' | 'device-code';

/**
 * A browser paired with the Lookout, revoked, or signed out, or a code made to pair another device (Settings → You →
 * Browsers & devices), in the project-wide `SIGN_IN_JOURNAL` file of the folder the Lookout was started in. Never
 * holds a session or a code: only the session's id and the browser's name.
 */
export interface SignInEntry {
  v: 1;
  kind: 'sign-in';
  at: number;
  mapId: string;
  action: SignInAction;
  /** The session, for every action but `device-code`. */
  sessionId?: string;
  /** "Chrome on macOS". */
  name?: string;
  /** Whether the session may change this machine's settings (`machine`) or not (`device`). */
  signIn?: 'machine' | 'device';
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** The journal "trail" that holds the Lookout's sign-ins. */
export const SIGN_IN_JOURNAL = '_sign-in';

export type SlackOwnerAction =
  'owner-claimed' | 'owner-confirmed' | 'owner-reset' | 'allow-added' | 'allow-removed' | 'app-changed' | 'removed';

/**
 * A change to who Teamtrail talks to, and who may act, in Slack (Settings → Slack), in the project-wide
 * `SLACK_JOURNAL` file: an account entered the one-time code, the trail lead confirmed or reset it, allowed a member
 * or stopped allowing one, connected a different Slack app (which drops the owner), or removed Slack. Never holds a
 * token or the code.
 */
export interface SlackOwnerEntry {
  v: 1;
  kind: 'slack';
  at: number;
  mapId: string;
  action: SlackOwnerAction;
  /** The Slack user id the change is about, and the name Slack gave for it; none for Slack removed as a whole. */
  user?: string;
  name?: string;
  /** How the account was put forward: the one-time code, the git email, or "This is me" in an older version. */
  via?: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

export type TrustAction = 'approved' | 'adopted' | 'reverted' | 'tracker-approved' | 'tracker-kept';

/**
 * The trail lead approving, on this machine, something the repo's files ask it to trust: the check commands, an
 * accepted brief, confirmed criteria or knowledge, a lowered risk policy, another tracker. In the project-wide
 * `TRUST_JOURNAL` file. The approval itself lives outside the repo (machine/machineStore.ts); this is its history.
 */
export interface TrustEntry {
  v: 1;
  kind: 'trust';
  at: number;
  mapId: string;
  action: TrustAction;
  /** What was approved, in words: "check commands", "brief of trail 3", "GitHub Issues in octo-org/launchpad". */
  subject: string;
  /** The content hash approved, or what it replaced. */
  detail?: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** The journal "trail" that holds changes to the Slack owner. */
export const SLACK_JOURNAL = '_slack';
/** The journal "trail" that holds this machine's approvals. */
export const TRUST_JOURNAL = '_trust';

export type JournalEntry = TransitionEntry | RerouteEntry;

/** Where transitions are recorded: a JSONL file in node, the lookout server from the browser, nowhere in demos. */
export interface Journal {
  append(entry: TransitionEntry): void | Promise<void>;
}
