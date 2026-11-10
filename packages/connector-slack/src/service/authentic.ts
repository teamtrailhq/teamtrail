import type { Envelope } from '../socket';
import type { SlackContext } from './slackContext';
import type { Payload } from './types';

/** The workspace a payload says it is from: slash commands and events carry `team_id`, interactions `team.id`. */
const teamOf = (p: Payload) => p.team_id ?? p.team?.id ?? p.user?.team_id;

/**
 * Whether an envelope is about the app and workspace connected here. Socket Mode is the only way in (there is no
 * HTTP events endpoint) and the socket is opened with this app's own token, so this is a second lock: a payload
 * naming another workspace or another app is dropped before anyone's id in it is believed. The workspace must be
 * there and match; the app id must match when the payload has one (message shortcuts don't always).
 */
export function authentic(ctx: SlackContext, e: Envelope): boolean {
  const c = ctx.store.read();
  const p = e.payload as Payload;
  if (!c.workspace || teamOf(p) !== c.workspace.id) return false;
  const app = p.api_app_id as string | undefined;
  return app === undefined || !c.appId || app === c.appId;
}
