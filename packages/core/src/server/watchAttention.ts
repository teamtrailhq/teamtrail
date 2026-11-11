import { attentionView } from '../attention/attentionView';
import type { AttentionView } from '../model/attention';
import type { RouteContext } from './routeContext';

/** What changes the queue the human sees: which items, in what order, how urgent, and which interrupt. */
function signature(v: AttentionView) {
  return JSON.stringify([
    v.items.map((i) => [i.id, i.score, i.urgency, i.reasons]),
    v.interrupting,
    v.focus,
    v.policy.errors,
  ]);
}

interface AttentionWatch {
  /** Stops watching. */
  stop: () => void;
  /** A queue `GET /attention` gave a page: one other than the last event means the next tick sends the queue. */
  served: (view: AttentionView) => void;
}

/**
 * Recomputes the attention queue every `pollMs` (questions, approvals, flags, leases, knowledge and
 * briefs all live in files other processes write) and sends a named `attention` SSE event with the
 * whole AttentionView when it changed since the last event, or since a page loaded a queue other than that one.
 * Without the second, a queue that changed and changed back between two ticks (a ticket added, then claimed) stays
 * on the page that loaded it in between: the tick sees nothing new to send.
 */
export function watchAttention(
  ctx: RouteContext,
  send: (text: string) => void,
  opts: { pollMs?: number; configDir?: string } = {},
): AttentionWatch {
  let last = '';
  let busy = false;
  const tick = async () => {
    const view = await attentionView({ root: ctx.root, adapter: await ctx.active(), configDir: opts.configDir });
    const sig = signature(view);
    if (sig === last) return;
    last = sig;
    send(`event: attention\ndata: ${JSON.stringify(view)}\n\n`);
  };
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void tick()
      .catch(() => {})
      .finally(() => (busy = false));
  }, opts.pollMs ?? 3000);
  timer.unref?.();
  return {
    stop: () => clearInterval(timer),
    served: (view) => {
      if (signature(view) !== last) last = '';
    },
  };
}
