import type { Envelope } from '../link/types';
import type { SlackContext } from './slackContext';
import type { Payload } from './types';

/** The workspace a payload says it is from: slash commands and events carry `team_id`, interactions `team.id`. */
const teamOf = (p: Payload) => p.team_id ?? p.team?.id ?? p.user?.team_id;

/**
 * Whether an envelope is about the workspace and app connected here. The Scout service checked Slack's signature
 * and sends this link only its own workspace's requests, so this is a second lock: a payload naming another
 * workspace or another app is dropped before anyone's id in it is believed. The workspace must be there and match;
 * the app id must match when both are known (message shortcuts don't always carry one).
 */
export function authentic(ctx: SlackContext, e: Envelope): boolean {
  const c = ctx.store.read();
  const p = e.payload as Payload;
  if (!c.workspace || teamOf(p) !== c.workspace.id) return false;
  const app = p.api_app_id as string | undefined;
  return app === undefined || !c.appId || app === c.appId;
}
