import { SlackApiError } from '@teamtrail/connector-slack/api';
import type { ServiceContext } from '../serviceContext';
import { botApi } from '../slack/botApi';
import type { Link } from '../types';
import { allowedCall } from './allowedCall';
import { ownsTarget } from './ownsTarget';
import { recordResult } from './recordResult';

export type CallResult = { ok: true; response: unknown } | { ok: false; error: string };

type CallContext = Pick<ServiceContext, 'store' | 'cipher' | 'config' | 'fetch' | 'log' | 'now' | 'members'>;

/** Sends a linked Teamtrail's Slack call with its workspace's bot token, if the call is allowed and its own. */
export async function proxyCall(
  ctx: CallContext,
  link: Link,
  call: { method: string; args: unknown },
): Promise<CallResult> {
  const verdict = allowedCall(link, call.method, call.args);
  const owned = verdict.ok && (await ownsTarget(ctx, link, { method: call.method, args: verdict.args }));
  if (!verdict.ok || !owned) {
    const error = verdict.ok ? 'not_the_link_owner' : verdict.error;
    ctx.log('call.refused', { link: link.id, method: call.method, error });
    return { ok: false, error };
  }
  const api = await botApi(ctx, link.teamId);
  if (!api) return { ok: false, error: 'not_installed' };
  const started = Date.now();
  try {
    const response = await api.call(call.method, verdict.args);
    await recordResult(ctx, link, { method: call.method, args: verdict.args, response });
    ctx.log('call', { link: link.id, method: call.method, ms: Date.now() - started });
    return { ok: true, response };
  } catch (e) {
    const error = e instanceof SlackApiError ? e.code : 'failed';
    ctx.log('call.failed', { link: link.id, method: call.method, error });
    return { ok: false, error };
  }
}
