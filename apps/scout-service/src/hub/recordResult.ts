import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';
import type { Link, Mark } from '../types';

type Obj = Record<string, unknown>;

const obj = (v: unknown): Obj => (typeof v === 'object' && v !== null ? (v as Obj) : {});
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** What a successful call made that the link now owns. */
function madeBy(call: { method: string; args: Obj }, response: Obj): Omit<Mark, 'linkId' | 'expiresAt'> | undefined {
  switch (call.method) {
    case 'chat.postMessage': {
      const channel = str(response.channel);
      const ts = str(response.ts);
      return channel && ts ? { kind: 'message', key: `${channel}:${ts}` } : undefined;
    }
    case 'conversations.open': {
      // Only a direct message counts as the owner's DM.
      const channel = str(obj(response.channel).id);
      return channel?.startsWith('D') ? { kind: 'dm', key: channel } : undefined;
    }
    case 'views.open':
    case 'views.publish':
    case 'views.update': {
      const view = str(obj(response.view).id);
      return view ? { kind: 'view', key: view } : undefined;
    }
    default:
      return undefined;
  }
}

const LIFETIME = { message: LIMITS.messageMs, dm: LIMITS.dmMs, view: LIMITS.viewMs, thread: LIMITS.threadMs };

/** Records what the link made (a post, its owner's DM, a view), so its later calls and Slack's clicks route back. */
export async function recordResult(
  ctx: Pick<ServiceContext, 'store' | 'now'>,
  link: Link,
  o: { method: string; args: Obj; response: unknown },
) {
  const made = madeBy(o, obj(o.response));
  if (!made) return;
  await ctx.store.mark({ ...made, linkId: link.id, expiresAt: ctx.now() + LIFETIME[made.kind] });
}
