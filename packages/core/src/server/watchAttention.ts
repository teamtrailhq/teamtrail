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

/**
 * Recomputes the attention queue every `pollMs` (questions, approvals, flags, leases, knowledge and
 * briefs all live in files other processes write) and sends a named `attention` SSE event with the
 * whole AttentionView when it changed. Returns the stop function.
 */
export function watchAttention(
  ctx: RouteContext,
  send: (text: string) => void,
  opts: { pollMs?: number; configDir?: string } = {},
): () => void {
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
  return () => clearInterval(timer);
}
