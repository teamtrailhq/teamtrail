import type { Link } from '../types';

/** The Slack methods a linked Teamtrail may call: exactly what the connector uses, nothing else. */
const METHODS = new Set([
  'auth.test',
  'bots.info',
  'chat.getPermalink',
  'chat.postEphemeral',
  'chat.postMessage',
  'chat.update',
  'conversations.open',
  'conversations.replies',
  'users.info',
  'users.list',
  'views.open',
  'views.publish',
  'views.update',
]);

/** Messages carry the link that posted them; a click is routed by the service's own record, which must agree. */
const STAMPED = new Set(['chat.postMessage', 'chat.update']);

export const LINK_METADATA_TYPE = 'scout_link';

export type Verdict = { ok: true; args: Record<string, unknown> } | { ok: false; error: string };

/** A call that would act on another person's DM or Home tab than the link's own Slack account. */
function aimsAtSomeoneElse(link: Link, method: string, args: Record<string, unknown>) {
  if (method === 'views.publish') return args.user_id !== link.userId;
  // Only the owner's own DM: `channel` (reopen any conversation by id) and every other argument are refused.
  if (method === 'conversations.open')
    return Object.keys(args).some((k) => k !== 'users') || args.users !== link.userId;
  return false;
}

/**
 * The checks that need no lookup: the method is one the connector uses, the arguments are an object, and the
 * Home tab and DM it opens are its owner's. The bot token is always the link's own workspace's, added by the
 * service: a `token` in the arguments is dropped. What the call touches is checked next (`ownsTarget`).
 */
export function allowedCall(link: Link, method: string, raw: unknown): Verdict {
  if (!METHODS.has(method)) return { ok: false, error: 'method_not_allowed' };
  const plain = raw === undefined || (typeof raw === 'object' && raw !== null && !Array.isArray(raw));
  if (!plain) return { ok: false, error: 'invalid_arguments' };
  const { token: _token, ...args } = (raw ?? {}) as Record<string, unknown>;
  if (aimsAtSomeoneElse(link, method, args)) return { ok: false, error: 'not_the_link_owner' };
  // Seen only by the link's own Slack account, whatever the call names: @Scout inbox and status in a channel.
  if (method === 'chat.postEphemeral') args.user = link.userId;
  if (STAMPED.has(method)) args.metadata = { event_type: LINK_METADATA_TYPE, event_payload: { link: link.id } };
  return { ok: true, args };
}
