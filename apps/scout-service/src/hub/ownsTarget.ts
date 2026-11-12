import type { ServiceContext } from '../serviceContext';
import type { Link, MarkKind } from '../types';
import { ownerInChannel } from './ownerInChannel';

type TargetContext = Pick<ServiceContext, 'store' | 'cipher' | 'config' | 'fetch' | 'now' | 'members'>;

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

async function holds(ctx: TargetContext, link: Link, m: { kinds: MarkKind[]; key: string | undefined }) {
  if (!m.key) return false;
  for (const kind of m.kinds) if ((await ctx.store.marked(kind, m.key, ctx.now())).includes(link.id)) return true;
  return false;
}

const at = (channel: unknown, ts: unknown) => {
  const c = str(channel);
  const t = str(ts);
  return c && t ? `${c}:${t}` : undefined;
};

/**
 * Where a post may go: the owner's own DM (by their user id, or the DM channel `conversations.open` gave this
 * link), or a public or private channel the owner is a member of. Never another DM or group DM.
 */
async function mayPostTo(ctx: TargetContext, link: Link, channel: string | undefined) {
  if (!channel) return false;
  if (channel === link.userId) return true;
  if (channel.startsWith('D')) return holds(ctx, link, { kinds: ['dm'], key: channel });
  if (channel.startsWith('C') || channel.startsWith('G')) return ownerInChannel(ctx, link, channel);
  return false;
}

/**
 * Whether the link owns what the call touches. Every link in a workspace shares one bot, so Slack would let any
 * of them edit or read what another posted; the service allows only what this link made or was given:
 * - `chat.update`: a message it posted;
 * - `views.update`: a view it opened or published (never by `external_id`);
 * - `conversations.replies`, `chat.getPermalink`: a message it posted, or one a shortcut gave it minutes ago;
 * - `chat.postMessage`: see `mayPostTo`.
 */
export async function ownsTarget(
  ctx: TargetContext,
  link: Link,
  call: { method: string; args: Record<string, unknown> },
) {
  const a = call.args;
  switch (call.method) {
    case 'chat.update':
      return holds(ctx, link, { kinds: ['message'], key: at(a.channel, a.ts) });
    case 'views.update':
      return a.external_id === undefined && holds(ctx, link, { kinds: ['view'], key: str(a.view_id) });
    case 'conversations.replies':
      return holds(ctx, link, { kinds: ['thread', 'message'], key: at(a.channel, a.ts) });
    case 'chat.getPermalink':
      return holds(ctx, link, { kinds: ['thread', 'message'], key: at(a.channel, a.message_ts) });
    case 'chat.postMessage':
      return mayPostTo(ctx, link, str(a.channel));
    default:
      return true;
  }
}
