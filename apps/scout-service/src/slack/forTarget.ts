import type { Envelope } from '@teamtrail/connector-slack/node';
import type { ServiceContext } from '../serviceContext';

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** `<channel>:<ts>` of the message an interaction acts on: a button's message, or a shortcut's message. */
function messageKey(payload: Obj) {
  const container = obj(payload.container);
  const channel = str(container.channel_id) ?? str(obj(payload.channel).id);
  const ts = str(container.message_ts) ?? str(obj(payload.message).ts);
  return channel && ts ? `${channel}:${ts}` : undefined;
}

/**
 * The envelope as this link may see it. A `response_url` can replace the message it came from, so it is passed
 * on only to the link on record as that message's poster: Alice's Save as decision on Bob's message must not
 * hand Alice a way to swap Bob's buttons for her own, which Bob's clicks would then carry to Bob's Teamtrail.
 */
export async function forTarget(ctx: Pick<ServiceContext, 'store' | 'now'>, envelope: Envelope, linkId: string) {
  if (envelope.type !== 'interactive') return envelope;
  const payload = envelope.payload as Obj;
  const key = messageKey(payload);
  const onMessage = payload.type === 'message_action' || obj(payload.container).type === 'message';
  if (!onMessage) return envelope;
  const poster = key ? await ctx.store.marked('message', key, ctx.now()) : [];
  if (poster.includes(linkId)) return envelope;
  const { response_url: _url, response_urls: _urls, ...rest } = payload;
  return { ...envelope, payload: rest };
}
