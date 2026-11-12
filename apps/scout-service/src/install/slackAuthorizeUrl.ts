import type { ServiceContext } from '../serviceContext';
import { BOT_SCOPES } from '../slack/botScopes';

/** Slack's consent screen for Scout's bot scopes, coming back to this service's callback with `state`. */
export function slackAuthorizeUrl(ctx: Pick<ServiceContext, 'config'>, state: string) {
  const slack = new URL(ctx.config.slackAuthorizeUrl);
  slack.searchParams.set('client_id', ctx.config.slackClientId);
  slack.searchParams.set('scope', BOT_SCOPES.join(','));
  slack.searchParams.set('redirect_uri', `${ctx.config.publicUrl}/oauth/callback`);
  slack.searchParams.set('state', state);
  return slack.toString();
}
