/** Browser-safe types shared by the local server (`/slack` routes) and Settings. No secrets cross this boundary. */

export type SlackState = 'off' | 'connecting' | 'online' | 'offline' | 'auth-error' | 'elsewhere' | 'unsupported';

/** Where a token came from. Values never leave the machine running `teamtrail`. */
export type SlackTokenSource = 'stored' | 'TEAMTRAIL_SLACK_APP_TOKEN' | 'TEAMTRAIL_SLACK_BOT_TOKEN';

export type SlackNotifyEvent = 'awaiting' | 'blocked' | 'trail.done' | 'resolved';
export const SLACK_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'trail.done', 'resolved'];
export const DEFAULT_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'trail.done'];

export interface SlackUser {
  id: string;
  name?: string;
  /** The full name on the Slack profile, shown next to the display name when the trail lead confirms the owner. */
  realName?: string;
  /**
   * How the account was put forward as the owner: its email is this machine's git email, it entered the one-time
   * code from Settings → Slack, or it clicked "This is me" on the Home tab (versions before the code).
   */
  via?: 'git-email' | 'code' | 'home';
  /** When the trail lead confirmed this account in the Lookout, on the machine Teamtrail runs on. */
  confirmedAt?: number;
  /**
   * Put forward only: whether this account's Slack email is this machine's git email. A hint for the trail lead,
   * never a proof (an address can be shared, and a workspace admin can set anyone's email). Unknown when undefined.
   */
  gitEmail?: boolean;
}

/** A Slack account that typed a wrong code, and how many times. */
export interface SlackWrongTry {
  id: string;
  name?: string;
  count: number;
}

export interface SlackNotify {
  /** `dm` (the owner's DM with Scout) or a channel id. */
  target: 'dm' | string;
  events: SlackNotifyEvent[];
  /** `titles-only` hides ask bodies, for channel targets. */
  detail: 'full' | 'titles-only';
}

/** 1 create app · 2 pick workspace (Slack) · 3 app-level token · 4 install + bot token · 5 confirm the owner. */
export type SlackSetupStep = 1 | 2 | 3 | 4 | 5 | 'done';

/** `GET <api>/slack`. */
export interface SlackStatus {
  state: SlackState;
  error?: string;
  enabled: boolean;
  step: SlackSetupStep;
  setup: {
    created: boolean;
    appId?: string;
    appToken: SlackTokenSource | null;
    botToken: SlackTokenSource | null;
  };
  workspace?: { id: string; name: string; url: string };
  bot?: { userId: string; name?: string };
  /** The confirmed owner. Empty until the trail lead confirms one; until then nothing is sent in Slack. */
  owners: SlackUser[];
  /** A Slack account put forward as the owner, waiting for the trail lead to confirm or refuse it here. */
  pendingOwner?: SlackUser;
  /** Set while a one-time code can be entered in Slack. The code itself is only in the answer that created it. */
  ownerCode?: { expiresAt: number; wrongTries: SlackWrongTry[] };
  /** The last code was dropped after too many wrong tries, and these accounts made them. */
  ownerCodeDropped?: { by: SlackWrongTry[] };
  /**
   * An owner an earlier version set without a code from this machine ("This is me", or a git-email match). It was
   * dropped on upgrade; the trail lead sets the owner again with a code.
   */
  ownerRedo?: { was: SlackUser; via: 'home' | 'git-email' };
  allow: SlackUser[];
  notify: SlackNotify;
  command: string;
  links: { create: string; app?: string; install?: string; home?: string; homeWeb?: string };
  /** Tracker folder of the other `teamtrail` that holds this machine's Slack connection. */
  heldBy?: string;
}

export interface SlackTokenResult {
  ok: boolean;
  kind?: 'app' | 'bot';
  error?: string;
  code?: string;
  status: SlackStatus;
}

/** `POST <api>/slack/owner/code`: the one-time code to enter in Slack. Answered once; no GET returns it. */
export interface SlackOwnerCode {
  code: string;
  expiresAt: number;
  status: SlackStatus;
}

export interface SlackSettingsPatch {
  enabled?: boolean;
  allow?: SlackUser[];
  notify?: Partial<SlackNotify>;
}
