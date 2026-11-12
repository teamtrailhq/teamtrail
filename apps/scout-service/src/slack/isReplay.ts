import { secrets } from '../crypto/secrets';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';

/**
 * Whether this signed command or click was already handled. A signature is valid for five minutes, so a copy of
 * one request (a proxy log, a leaked capture) could be sent again in that window; it is handled once.
 */
export function isReplay(ctx: Pick<ServiceContext, 'replays' | 'now'>, signature: string) {
  const now = ctx.now();
  const key = secrets.hash(signature);
  const until = ctx.replays.get(key);
  if (until && until > now) return true;
  if (ctx.replays.size >= LIMITS.replayEntries) for (const [k, t] of ctx.replays) if (t <= now) ctx.replays.delete(k);
  if (ctx.replays.size >= LIMITS.replayEntries) ctx.replays.delete(ctx.replays.keys().next().value as string);
  ctx.replays.set(key, now + LIMITS.replayMs);
  return false;
}
