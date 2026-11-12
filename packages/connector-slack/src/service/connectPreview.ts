import { BRAND } from '@teamtrail/core';
import type { SlackConnectPreview } from '../types';
import { ConnectError, mustHoldConnection, now } from './connect';
import { LINK_CODE } from './connectState';
import type { SlackContext } from './slackContext';

/**
 * `POST /slack/connect/preview` `{ code }`: who the code the browser came back with belongs to, asked of the service
 * with the verifier kept here and without using the code up, so the trail lead confirms "Connect as @user in
 * <workspace>?" before anything is saved. The verifier stays until they choose Connect or Cancel.
 */
export async function previewConnect(ctx: SlackContext, code: string): Promise<SlackConnectPreview> {
  mustHoldConnection(ctx);
  const pending = ctx.connecting;
  if (!pending || pending.expiresAt < now(ctx))
    throw new ConnectError('Nothing is waiting to connect here. Choose Add Scout to Slack again.');
  if (!LINK_CODE.test(code)) throw new ConnectError('That link is not one Scout made.');
  const f = ctx.o.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(`${ctx.scout.http}/link/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, verifier: pending.verifier }),
    });
  } catch {
    throw new ConnectError(`${BRAND.assistant.name} is unreachable. Check your connection and add it again.`);
  }
  const body = (await res.json().catch(() => ({}))) as Partial<SlackConnectPreview> & {
    team?: { id?: string; name?: string };
  };
  if (!res.ok || !body.team?.id || !body.user?.id) {
    ctx.connecting = undefined;
    throw new ConnectError('That link expired or was already used. Choose Add Scout to Slack again.');
  }
  return {
    workspace: { id: body.team.id, name: body.team.name ?? body.team.id },
    user: { id: body.user.id, ...(body.user.name ? { name: body.user.name } : {}) },
  };
}

/** `POST /slack/connect/cancel`: the trail lead said no; the verifier goes, so the code is useless here too. */
export function cancelConnect(ctx: SlackContext) {
  ctx.connecting = undefined;
}
