import { SlackApiError } from '@teamtrail/connector-slack/api';
import type { ServiceContext } from '../serviceContext';

/** Slack's error code for a failed call, never its message or the text that was sent. */
function errorCode(e: unknown) {
  return e instanceof SlackApiError ? e.code : 'failed';
}

/** Logs a reply the service couldn't make for a Teamtrail it couldn't reach: the method and Slack's code only. */
export function offlineFailed(ctx: Pick<ServiceContext, 'log'>, method: string, e: unknown) {
  ctx.log('offline.failed', { method, error: errorCode(e) });
}
