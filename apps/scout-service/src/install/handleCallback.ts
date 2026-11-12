import type { ServerResponse } from 'node:http';
import { secrets } from '../crypto/secrets';
import { reply } from '../http/reply';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import { exchangeCode, InstallError } from '../slack/exchangeCode';

const START_AGAIN = 'Open Settings → Slack in the Lookout and choose Add Scout to Slack again.';

const REASONS: Record<string, string> = {
  access_denied: 'Scout was not added: the request was cancelled in Slack.',
  enterprise_install: 'Scout can be added to one workspace at a time, not to a whole Enterprise Grid organization.',
};

function failed(res: ServerResponse, code: string) {
  const reason = REASONS[code] ?? "Slack didn't finish adding Scout.";
  reply.page(res, 400, { title: 'Scout was not added', text: `${reason} ${START_AGAIN}` });
}

/**
 * `GET /oauth/callback`: Slack sends the browser back with a code. The state must be one this service issued
 * and is used once. The workspace's bot token is sealed and stored; the browser goes back to the Lookout that
 * started the install with a one-minute code in the fragment, which only that Lookout can exchange.
 */
export async function handleCallback(ctx: ServiceContext, url: URL, res: ServerResponse) {
  const state = url.searchParams.get('state') ?? '';
  const pending = state ? await ctx.store.takeInstall(secrets.hash(state), ctx.now()) : undefined;
  if (!pending) return reply.page(res, 400, { title: 'This link has expired', text: START_AGAIN });
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (error || !code) return failed(res, error ?? 'missing_code');
  let installed;
  try {
    installed = await exchangeCode({ config: ctx.config, fetch: ctx.fetch, code });
  } catch (e) {
    const reason = e instanceof InstallError ? e.message : 'failed';
    ctx.log('install.failed', { error: reason });
    return failed(res, reason);
  }
  await ctx.store.saveWorkspace({
    teamId: installed.teamId,
    teamName: installed.teamName,
    botUserId: installed.botUserId,
    botToken: ctx.cipher.seal(installed.botToken, installed.teamId),
    scopes: installed.scopes,
    installedBy: installed.userId,
    installedAt: ctx.now(),
  });
  const linkCode = secrets.random();
  await ctx.store.saveCode({
    codeHash: secrets.hash(linkCode),
    challenge: pending.challenge,
    teamId: installed.teamId,
    userId: installed.userId,
    expiresAt: ctx.now() + LIMITS.codeMs,
  });
  ctx.log('install.done', { team: installed.teamId });
  reply.redirect(res, `${pending.returnUrl}#slack-link=${linkCode}`);
}
