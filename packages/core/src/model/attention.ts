/**
 * The attention queue: everything that needs the human, ranked by code (attention/buildAttention.ts).
 * Files:
 *   <tracker dir>/attention.json               AttentionPolicy, the team's weights and threshold. Committed.
 *   <config dir>/attention.json                AttentionPrefs, this person's focus hours and channel. Machine-local.
 *   <tracker dir>/.attention/state.json        AttentionState, snoozes and dismissals. Gitignored.
 */

/** Where an item comes from. Adding a kind: a source in `attention/sources/`, a line in its registry, a weight here. */
export type AttentionKind =
  | 'question'
  | 'approval'
  | 'blocked'
  | 'flag'
  | 'stalled'
  | 'hitl-ready'
  | 'knowledge'
  | 'brief'
  | 'policy'
  | 'reroute'
  | 'reroute-suggested'
  | 'overlap'
  | 'integration'
  | 'model'
  | 'guide'
  | 'guide-checks'
  | 'delivery'
  | 'tracker-settings'
  | 'trust';

/** `blocking`: the agent can do no useful work until answered. `soon`: the default. `fyi`: whenever convenient. */
export type AttentionUrgency = 'blocking' | 'soon' | 'fyi';

export const ATTENTION_URGENCIES: AttentionUrgency[] = ['blocking', 'soon', 'fyi'];

export interface AttentionItem {
  /** Stable across ticks: `<kind>:<mapId>:<ref>`. Snoozes and dismissals key on it. */
  id: string;
  kind: AttentionKind;
  /** The trail; empty for project-wide items such as knowledge. */
  mapId: string;
  ticketId?: string;
  /** What the human is asked to do, in one line. */
  title: string;
  /** When it started waiting (epoch ms). */
  since: number;
  urgency: AttentionUrgency;
  /** Higher comes first. Explained by `reasons`. */
  score: number;
  /** Why it ranks where it does, in plain words: "blocks 4 tickets", "claude-07 idle for 12 min". */
  reasons: string[];
  /** Items with the same key are answered together; the queue keeps them next to each other. */
  batchKey: string;
  /** The source object: a question id, a ticket id, a flag kind, a knowledge or brief id. */
  ref: string;
  /** Who raised it, when an agent did. */
  agent?: string;
}

/** `<tracker dir>/attention.json`. Every field is optional; a missing file means the defaults. */
export interface AttentionPolicy {
  v: 1;
  /** 0–100 per kind: how much the kind alone counts. */
  weights: Record<AttentionKind, number>;
  /** Items scoring at or above this notify actively (browser, Slack); the rest wait in the queue. */
  interrupt: number;
  /** How often the digest of non-interrupting items goes out, in minutes; 0 turns it off. */
  digestMinutes: number;
}

export type NotifyChannel = 'browser' | 'slack-dm' | 'slack-channel' | 'none';

/** Daily quiet hours in local time, `HH:MM`; `to` before `from` spans midnight. */
export interface FocusHours {
  from: string;
  to: string;
  /** 0 = Sunday … 6 = Saturday; missing means every day. */
  days?: number[];
}

/** `<config dir>/attention.json`: one person's preferences, never in a repo. */
export interface AttentionPrefs {
  v: 1;
  focus?: FocusHours;
  /** Focus mode switched on by hand until this time (epoch ms). */
  focusUntil?: number;
  /** Quiet hours set aside by hand until this time (epoch ms): focus ended early, interruptions are back. */
  focusOffUntil?: number;
  channel: NotifyChannel;
}

/**
 * Whether focus holds interruptions back right now, and why: switched on by hand, the daily quiet hours, quiet
 * hours paused by hand, or off. `until` is when that state ends on its own.
 */
export type FocusState =
  | { kind: 'off' }
  | { kind: 'manual'; until: number }
  | { kind: 'hours'; until: number }
  | { kind: 'paused'; until: number };

/** What the person did from the focus control: focus for a while, end focus now, or let quiet hours hold again. */
export type FocusChange = { kind: 'for'; minutes: number } | { kind: 'end' } | { kind: 'resume' };

/** `<tracker dir>/.attention/state.json`. */
export interface AttentionState {
  v: 1;
  /** Item id → hidden until (epoch ms). */
  snoozed: Record<string, number>;
  /** `fyi` item ids the human set aside; they stay hidden while the item exists. */
  dismissed: string[];
  lastDigestAt?: number;
}

/** What `GET /attention` returns. */
export interface AttentionView {
  items: AttentionItem[];
  /** Ids of items that notify now: at or above the threshold and outside focus. */
  interrupting: string[];
  policy: { file: string; exists: boolean; errors: string[]; value: AttentionPolicy };
  prefs: AttentionPrefs;
  /** True while focus hours or focus mode hold interruptions back. */
  focused: boolean;
  /** Why focus is on or off, and until when. */
  focus: FocusState;
  /** Items that would interrupt now if focus were off; they wait in the queue meanwhile. */
  heldBack: number;
  /** Items hidden by snoozes and dismissals. */
  hidden: number;
}
