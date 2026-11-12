import type { ServiceConfig } from '../types';

/** What a finished Slack install gives the service. */
export interface Installed {
  teamId: string;
  teamName: string;
  botUserId: string;
  botToken: string;
  scopes: string[];
  /** The Slack account that went through the install: Scout's owner for the Lookout that started it. */
  userId: string;
}

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

export class InstallError extends Error {}

function installed(body: Obj): Installed {
  if (body.ok !== true) throw new InstallError(str(body.error) ?? 'oauth_failed');
  if (body.is_enterprise_install === true) throw new InstallError('enterprise_install');
  const botToken = str(body.access_token);
  const teamId = str(obj(body.team).id);
  const botUserId = str(body.bot_user_id);
  const userId = str(obj(body.authed_user).id);
  const valid = botToken?.startsWith('xoxb-') && body.token_type === 'bot' && teamId && botUserId && userId;
  if (!valid) throw new InstallError('unexpected_answer');
  return {
    teamId: teamId!,
    teamName: str(obj(body.team).name) ?? teamId!,
    botUserId: botUserId!,
    botToken: botToken!,
    scopes: (str(body.scope) ?? '').split(',').filter(Boolean),
    userId: userId!,
  };
}

/** Slack's `oauth.v2.access`: the code from the callback for the workspace's bot token and the installing user. */
export async function exchangeCode(o: { config: ServiceConfig; fetch: typeof fetch; code: string }) {
  const auth = Buffer.from(`${o.config.slackClientId}:${o.config.slackClientSecret}`).toString('base64');
  let res: Response;
  try {
    res = await o.fetch(`${o.config.slackApiUrl}/oauth.v2.access`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: o.code, redirect_uri: `${o.config.publicUrl}/oauth/callback` }).toString(),
    });
  } catch {
    throw new InstallError('slack_unreachable');
  }
  const body = obj(await res.json().catch(() => ({})));
  return installed(body);
}
