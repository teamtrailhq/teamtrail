import type { RefusedNotice } from './trail/refusedNotices';

const NOTE =
  "The tracker refused these writes of yours for good, so they did not happen there. Don't assume they did: look at the trail again (status) before you go on. The trail lead sees them in the Lookout and can retry or discard them.";

/** Tells the agent, once, which of its tracker writes were refused after they were queued. */
export function withRefusedWrites(v: unknown, take: () => RefusedNotice[]) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
  const writes = take();
  if (!writes.length) return v;
  return { ...v, trackerRefused: { writes, note: NOTE } };
}
