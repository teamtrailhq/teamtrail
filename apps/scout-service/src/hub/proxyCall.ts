import { SlackApi, SlackApiError } from '@teamtrail/connector-slack/api';
import type { ServiceContext } from '../serviceContext';
import type { Link } from '../types';
import { allowedCall } from './allowedCall';

export type CallResult = { ok: true; response: unknown } | { ok: false; error: string };

type CallContext = Pick<ServiceContext, 'store' | 'cipher' | 'config' | 'fetch' | 'log'>;

/** Sends a linked Teamtrail's Slack call with its workspace's bot token, if the call is allowed. */
export async function proxyCall(
  ctx: CallContext,
  link: Link,
  call: { method: string; args: unknown },
): Promise<CallResult> {
  const verdict = allowedCall(link, call.method, call.args);
  if (!verdict.ok) {
    ctx.log('call.refused', { link: link.id, method: call.method, error: verdict.error });
    return verdict;
  }
  const workspace = await ctx.store.workspace(link.teamId);
  if (!workspace) return { ok: false, error: 'not_installed' };
  const token = ctx.cipher.open(workspace.botToken, workspace.teamId);
  const api = new SlackApi({ token, apiUrl: ctx.config.slackApiUrl, fetch: ctx.fetch });
  const started = Date.now();
  try {
    const response = await api.call(call.method, verdict.args);
    ctx.log('call', { link: link.id, method: call.method, ms: Date.now() - started });
    return { ok: true, response };
  } catch (e) {
    const error = e instanceof SlackApiError ? e.code : 'failed';
    ctx.log('call.failed', { link: link.id, method: call.method, error });
    return { ok: false, error };
  }
}
