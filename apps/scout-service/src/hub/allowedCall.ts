import type { Link } from '../types';

/** The Slack methods a linked Teamtrail may call: exactly what the connector uses, nothing else. */
const METHODS = new Set([
  'auth.test',
  'bots.info',
  'chat.getPermalink',
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

/** Messages carry the link that posted them, so a click on one is routed back to it. */
const STAMPED = new Set(['chat.postMessage', 'chat.update']);

export const LINK_METADATA_TYPE = 'scout_link';

type Verdict = { ok: true; args: Record<string, unknown> } | { ok: false; error: string };

const isUserId = (v: unknown) => typeof v === 'string' && /^[UW]/.test(v);

/** A call that would act on another person's DM or Home tab than the link's own Slack account. */
function aimsAtSomeoneElse(link: Link, method: string, args: Record<string, unknown>) {
  if (method === 'views.publish') return args.user_id !== link.userId;
  if (method === 'conversations.open') return args.users !== link.userId;
  if (method === 'chat.postMessage') return isUserId(args.channel) && args.channel !== link.userId;
  return false;
}

/**
 * Whether a linked Teamtrail may make this call, and the arguments to send. The bot token is always the link's
 * own workspace's, added by the service: a `token` in the arguments is dropped, so a link can never reach
 * another workspace. DMs and the Home tab are the link owner's only.
 */
export function allowedCall(link: Link, method: string, raw: unknown): Verdict {
  if (!METHODS.has(method)) return { ok: false, error: 'method_not_allowed' };
  const plain = raw === undefined || (typeof raw === 'object' && raw !== null && !Array.isArray(raw));
  if (!plain) return { ok: false, error: 'invalid_arguments' };
  const { token: _token, ...args } = (raw ?? {}) as Record<string, unknown>;
  if (aimsAtSomeoneElse(link, method, args)) return { ok: false, error: 'not_the_link_owner' };
  if (STAMPED.has(method)) args.metadata = { event_type: LINK_METADATA_TYPE, event_payload: { link: link.id } };
  return { ok: true, args };
}
