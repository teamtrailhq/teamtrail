import type { ServerResponse } from 'node:http';
import { secrets } from '../crypto/secrets';
import { reply } from '../http/reply';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { slackAuthorizeUrl } from './slackAuthorizeUrl';

/**
 * `GET /install-slack`: the direct install URL (the site's Add to Slack button, the Slack Marketplace). It starts
 * Slack's consent screen under a fresh single-use state, with no Lookout behind it: the callback installs Scout in
 * the workspace and links no one. Each person then connects their own Teamtrail from its Settings → Slack.
 */
export async function handleInstallSlack(ctx: ServiceContext, res: ServerResponse) {
  const state = secrets.random();
  await ctx.store.saveInstall({
    stateHash: secrets.hash(state),
    challenge: '',
    returnUrl: '',
    expiresAt: ctx.now() + LIMITS.installMs,
  });
  ctx.log('install.start', { from: 'slack' });
  reply.redirect(res, slackAuthorizeUrl(ctx, state), 302);
}
