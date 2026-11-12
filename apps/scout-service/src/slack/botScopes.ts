/**
 * The bot scopes Scout asks for, the same as `slack-manifest.json` (a test keeps them equal). No user scopes:
 * the installing account comes from `authed_user` in Slack's answer. `users:read.email` is gone, since the
 * owner is now whoever went through the install. `channels:read` and `groups:read` let the service check that a
 * link's owner is in a channel before the link posts there (`conversations.members`).
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
] as const;
