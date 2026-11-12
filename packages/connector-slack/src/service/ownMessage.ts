import type { SlackContext } from './slackContext';
import type { Payload } from './types';

/** The link a message says posted it: the stamp the Scout service puts in its metadata, when Slack passes it on. */
function stampOf(p: Payload): string | undefined {
  const meta = p.message?.metadata;
  if (meta?.event_type !== 'scout_link') return undefined;
  const link = meta.event_payload?.link;
  return typeof link === 'string' ? link : undefined;
}

/** Whether this Teamtrail posted the message at `channel`/`ts`: every message with buttons is kept in a store. */
function postedHere(ctx: SlackContext, channel: string, ts: string) {
  const at = (r: { channel: string; ts: string }) => r.channel === channel && r.ts === ts;
  return (
    Object.values(ctx.asks.read()).some(at) ||
    Object.values(ctx.approvals.read()).some(at) ||
    Object.values(ctx.settingRequests.read()).some(at)
  );
}

/**
 * Whether a button click is on a message this Teamtrail posted, behind the Scout service's own routing. Every
 * Teamtrail in a workspace speaks through the same bot, so "Scout posted it" proves nothing. The service stamps each
 * post with the link that made it (only the service can): when Slack passes the stamp on, it must be this link's.
 * Without one, the message must be one this Teamtrail keeps a record of. Clicks in a modal or the Home tab carry no
 * message and are judged where they land.
 */
export function ownMessage(ctx: SlackContext, p: Payload): boolean {
  if (p.container?.type !== 'message') return true;
  const stamp = stampOf(p);
  if (stamp !== undefined) return stamp === ctx.ready?.linkId;
  const channel = p.container.channel_id ?? p.channel?.id;
  const ts = p.container.message_ts ?? p.message?.ts;
  return typeof channel === 'string' && typeof ts === 'string' && postedHere(ctx, channel, ts);
}
