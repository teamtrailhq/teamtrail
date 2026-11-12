import type { SlackStatus } from '../types';
import type { SlackContext } from './slackContext';

/** The scope @Scout mentions need; workspaces installed before 0.29 lack it. */
const MENTIONS_SCOPE = 'app_mentions:read';

/** Scout's Home tab: in the Slack app, and through the web for a browser without it. */
function homeLinks(teamId: string, appId: string) {
  return {
    home: `slack://app?team=${teamId}&id=${appId}&tab=home`,
    homeWeb: `https://slack.com/app_redirect?app=${appId}&team=${teamId}`,
  };
}

export function statusOf(ctx: SlackContext): SlackStatus {
  const c = ctx.store.read();
  const connected = !!ctx.store.link();
  const delivery = ctx.delivery.get();
  return {
    state: ctx.state,
    error: ctx.error,
    enabled: connected && c.enabled,
    connected,
    ...(ctx.store.legacy() ? { legacy: true } : {}),
    ...(connected && c.workspace ? { workspace: c.workspace } : {}),
    ...(connected && c.bot ? { bot: c.bot } : {}),
    owners: connected ? c.owners : [],
    allow: c.allow,
    notify: c.notify,
    command: c.command,
    links: connected && c.appId && c.workspace ? homeLinks(c.workspace.id, c.appId) : {},
    ...(ctx.heldBy ? { heldBy: ctx.heldBy } : {}),
    ...(delivery ? { delivery } : {}),
    ...(ctx.ready?.scopes ? { mentions: ctx.ready.scopes.includes(MENTIONS_SCOPE) } : {}),
  };
}
