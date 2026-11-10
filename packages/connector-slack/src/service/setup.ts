import { BRAND } from '@teamtrail/core';
import { SlackApiError } from '../api';
import { BOT_SCOPES, appIdFromToken, tokenKind } from '../manifest';
import { probeSocket } from '../socket';
import { socketUrl } from '../socketUrl';
import type { SlackTokenResult } from '../types';
import { statusOf } from './setupStatus';
import type { SlackContext } from './slackContext';
import { journalSlack } from './slackJournal';

/**
 * Tokens from $TEAMTRAIL_SLACK_APP_TOKEN / $TEAMTRAIL_SLACK_BOT_TOKEN are verified like pasted ones
 * on first start, but stay in the environment: nothing is written to the credential store.
 */
export async function adoptEnvTokens(ctx: SlackContext) {
  const t = ctx.store.tokens();
  if (!t.app || !t.bot || (t.app.source === 'stored' && t.bot.source === 'stored')) return;
  for (const token of [t.app.token, t.bot.token]) {
    const r = await verifyToken(ctx, token, false);
    if (!r.ok) {
      ctx.state = 'auth-error';
      ctx.error = r.error;
      return;
    }
  }
}

/** Why a token was refused: the message for the trail lead and a code for the UI. */
type Refusal = { error: string; code: string };

const WRONG_KIND: Record<string, Refusal> = {
  user: {
    error: 'That is a user token (xoxp-). Paste the Bot User OAuth Token (xoxb-) from Install App.',
    code: 'user_token',
  },
  config: {
    error: 'That is a configuration token. Paste the app-level token (xapp-) or the bot token (xoxb-).',
    code: 'config_token',
  },
  unknown: {
    error: 'Not a Slack token. App-level tokens start with xapp-, bot tokens with xoxb-.',
    code: 'unknown_token',
  },
};

const APP_TOKEN_ERRORS: Record<string, string> = {
  offline: 'Slack is unreachable. Check your connection and paste again.',
  missing_scope: 'This token is missing connections:write. Generate it again with the connections:write scope.',
  not_allowed_token_type: 'That is not an app-level token. Generate one under Basic Information → App-Level Tokens.',
};

export async function verifyToken(ctx: SlackContext, token: string, save: boolean): Promise<SlackTokenResult> {
  const kind = tokenKind(token);
  if (kind !== 'app' && kind !== 'bot') return { ok: false, ...WRONG_KIND[kind], status: statusOf(ctx) };
  const refused = kind === 'app' ? await verifyAppToken(ctx, token, save) : await verifyBotToken(ctx, token, save);
  if (refused) return { ok: false, ...refused, kind, status: statusOf(ctx) };
  const t = ctx.store.tokens();
  if (t.app && t.bot) {
    ctx.stop();
    ctx.store.update({ enabled: true });
    ctx.start();
  }
  return { ok: true, kind, status: statusOf(ctx) };
}

/** An app-level token must open a Socket Mode connection; a token of a different app resets the bot side. */
async function verifyAppToken(ctx: SlackContext, token: string, save: boolean): Promise<Refusal | undefined> {
  let url: string;
  try {
    url = (await ctx.api(token).call<{ url: string }>('apps.connections.open')).url;
  } catch (e) {
    const code = e instanceof SlackApiError ? e.code : 'error';
    const error =
      APP_TOKEN_ERRORS[code] ?? 'Slack rejected that token. Generate a new app-level token and copy it again.';
    return { error, code };
  }
  if (!ctx.WS) return { error: 'Slack needs Node.js 22 or newer.', code: 'unsupported' };
  try {
    url = socketUrl(url, ctx.apiUrl);
  } catch (e) {
    return { error: `${(e as Error).message}.`, code: 'bad_socket_url' };
  }
  let hello: { appId?: string };
  try {
    hello = await probeSocket(url, ctx.WS);
  } catch {
    return {
      error: 'Socket Mode is off. Turn it on under Socket Mode in the app settings, then paste again.',
      code: 'socket_mode_off',
    };
  }
  const appId = appIdFromToken(token) ?? hello.appId;
  const prev = ctx.store.read();
  if (prev.appId && appId && prev.appId !== appId) {
    // A different app: its bot token, workspace and owner no longer apply.
    ctx.stop();
    if (save) ctx.store.saveToken('bot', '');
    const was = prev.owners[0] ?? prev.pendingOwner;
    ctx.store.update({ workspace: undefined, bot: undefined, owners: [], pendingOwner: undefined, enabled: false });
    ctx.ownerCode = undefined;
    journalSlack(ctx, { action: 'app-changed', who: was, by: 'lead' });
  }
  if (save) ctx.store.saveToken('app', token);
  ctx.store.update({ appId, created: true });
  return undefined;
}

type AuthTest = { team_id: string; team: string; url: string; user_id: string; user: string; bot_id?: string };

/** A bot token must pass auth.test with every scope, and belong to this app; then the workspace is saved. */
async function verifyBotToken(ctx: SlackContext, token: string, save: boolean): Promise<Refusal | undefined> {
  const api = ctx.api(token);
  let who: AuthTest;
  try {
    who = await api.call('auth.test');
  } catch (e) {
    const code = e instanceof SlackApiError ? e.code : 'error';
    if (code === 'offline') return { error: 'Slack is unreachable. Check your connection and paste again.', code };
    return { error: 'Slack rejected that token. Copy the Bot User OAuth Token from Install App again.', code };
  }
  const granted = api.scopes;
  const missing = granted ? BOT_SCOPES.filter((s) => !granted.includes(s)) : [];
  if (missing.length)
    return {
      error: `The app is missing ${missing.join(', ')}. Reinstall it from Install App, then paste the new token.`,
      code: 'missing_scope',
    };
  const otherApp = await otherAppOf(ctx, api, who.bot_id);
  if (otherApp)
    return {
      error: `That bot token belongs to another Slack app (${otherApp}). Paste the token from ${BRAND.assistant.name}'s Install App page.`,
      code: 'wrong_app',
    };
  if (save) ctx.store.saveToken('bot', token);
  ctx.store.update({
    workspace: { id: who.team_id, name: who.team, url: who.url },
    bot: { userId: who.user_id, name: who.user },
  });
  return undefined;
}

/** The bot's app, when it isn't the app already connected. */
async function otherAppOf(ctx: SlackContext, api: ReturnType<SlackContext['api']>, botId?: string) {
  const appId = ctx.store.read().appId;
  if (!appId || !botId) return undefined;
  const info = await api.call<{ bot?: { app_id?: string } }>('bots.info', { bot: botId }).catch(() => undefined);
  const botApp = info?.bot?.app_id;
  return botApp && botApp !== appId ? botApp : undefined;
}
