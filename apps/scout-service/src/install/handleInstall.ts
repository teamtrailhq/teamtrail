import type { ServerResponse } from 'node:http';
import { secrets } from '../crypto/secrets';
import { reply } from '../http/reply';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { returnAddress } from './returnAddress';
import { slackAuthorizeUrl } from './slackAuthorizeUrl';

/**
 * `GET /install?challenge=…&return=…`: a Lookout starts adding Scout. The service keeps the Lookout's PKCE
 * challenge and its loopback address under a fresh OAuth state, and sends the browser to Slack's consent screen.
 */
export async function handleInstall(ctx: ServiceContext, url: URL, res: ServerResponse) {
  const challenge = url.searchParams.get('challenge');
  const returnUrl = returnAddress(url.searchParams.get('return'));
  if (!secrets.wellFormed(challenge) || !returnUrl) {
    return reply.page(res, 400, {
      title: "Scout can't be added from this link",
      text: 'Open Settings → Slack in the Lookout and choose Add Scout to Slack.',
    });
  }
  const state = secrets.random();
  await ctx.store.saveInstall({
    stateHash: secrets.hash(state),
    challenge,
    returnUrl,
    expiresAt: ctx.now() + LIMITS.installMs,
  });
  ctx.log('install.start');
  reply.redirect(res, slackAuthorizeUrl(ctx, state));
}
