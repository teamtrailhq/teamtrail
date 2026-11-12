/** Browser-safe types shared by the local server (`/slack` routes) and Settings. No secrets cross this boundary. */

import type { DeliveryProblem } from '@teamtrail/core';

/**
 * `other-service`: the link was made with another Scout service than the one this Teamtrail points at now
 * (`$TEAMTRAIL_SCOUT_SERVICE`), so its token isn't sent.
 */
export type SlackState =
  'off' | 'connecting' | 'online' | 'offline' | 'auth-error' | 'elsewhere' | 'unsupported' | 'other-service';

export type SlackNotifyEvent = 'awaiting' | 'blocked' | 'trail.done' | 'resolved';
export const SLACK_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'trail.done', 'resolved'];
export const DEFAULT_NOTIFY_EVENTS: SlackNotifyEvent[] = ['awaiting', 'blocked', 'trail.done'];

export interface SlackUser {
  id: string;
  /** The unique Slack username, when Slack said; elsewhere the name Slack shows. */
  name?: string;
  /** The full name on the Slack profile. */
  realName?: string;
  /**
   * The display name on the Slack profile. Anyone can set theirs to anything, so it is shown after `name`, the
   * unique username, never as the handle.
   */
  displayName?: string;
  /** How the owner was set: through Add Scout to Slack, from this machine's Lookout. */
  via?: 'oauth';
  /** When this machine connected the account as the owner. */
  confirmedAt?: number;
}

export interface SlackNotify {
  /** `dm` (the owner's DM with Scout) or a channel id. */
  target: 'dm' | string;
  events: SlackNotifyEvent[];
  /** `titles-only` hides ask bodies, for channel targets. */
  detail: 'full' | 'titles-only';
}

/** `GET <api>/slack`. */
export interface SlackStatus {
  state: SlackState;
  error?: string;
  enabled: boolean;
  /** Linked to the Scout service: Add Scout to Slack finished on this machine. */
  connected: boolean;
  /**
   * Settings from a version where you made your own Slack app. Nothing of it is used; its tokens are deleted when
   * you connect Scout or remove Slack.
   */
  legacy?: boolean;
  workspace?: { id: string; name: string; url?: string };
  bot?: { userId: string; name?: string };
  /** The owner: the Slack account that went through Add Scout to Slack from this machine. */
  owners: SlackUser[];
  allow: SlackUser[];
  notify: SlackNotify;
  command: string;
  links: { home?: string; homeWeb?: string };
  /** The last message Slack refused for good (an archived channel, the bot removed), until one gets through. */
  delivery?: DeliveryProblem;
  /** Tracker folder of the other `teamtrail` that holds this machine's Slack connection. */
  heldBy?: string;
  /**
   * False when the workspace was installed before Scout asked for `app_mentions:read`: @Scout in a channel can't
   * reach this Teamtrail until someone adds Scout again. Unknown (absent) until the link is ready.
   */
  mentions?: boolean;
}

/** `POST <api>/slack/connect/preview`: who the code belongs to, for "Connect as @user in <workspace>?". */
export interface SlackConnectPreview {
  workspace: { id: string; name: string };
  user: { id: string; name?: string };
}

/** `POST <api>/slack/connect/start`: where to send the browser to add Scout (the service, then Slack's consent). */
export interface SlackConnectStart {
  url: string;
}

export interface SlackSettingsPatch {
  enabled?: boolean;
  allow?: SlackUser[];
  notify?: Partial<SlackNotify>;
}
