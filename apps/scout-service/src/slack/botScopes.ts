/**
 * The bot scopes Scout asks for, the same as `slack-manifest.json` (a test keeps them equal). No user scopes:
 * the installing account comes from `authed_user` in Slack's answer. `users:read.email` is gone, since the
 * owner is now whoever went through the install. `channels:read` and `groups:read` let the service check that a
 * link's owner is in a channel before the link posts there (`conversations.members`). `app_mentions:read` lets
 * people ask Scout with @Scout in a channel; DMs to Scout come with `im:history`. A workspace installed before
 * `app_mentions:read` keeps everything else, and its Teamtrail says to reconnect for mentions.
 */
export const BOT_SCOPES = [
  'commands',
  'chat:write',
  'im:write',
  'channels:history',
  'groups:history',
  'im:history',
  'mpim:history',
  'users:read',
  'channels:read',
  'groups:read',
  'app_mentions:read',
] as const;
