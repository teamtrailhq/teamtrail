import type { TicketPhase } from '../model/lifecycle';
import { derivePhases } from '../planning/lifecycle/phase';
import type { RouteContext } from './routeContext';

/**
 * What PR sync and proof posting read of a ticket: done, cancelled, in progress (a merged PR flags it) or anything
 * else. A move between these changes the ticket's flags, its review queue entry or its proof on the pull request.
 */
function syncClass(phase: TicketPhase): string {
  if (phase === 'done' || phase === 'cancelled') return phase;
  if (phase === 'working' || phase === 'verifying' || phase === 'rework') return 'in-progress';
  return 'other';
}

async function readClasses(ctx: RouteContext): Promise<Map<string, string>> {
  const adapter = await ctx.active();
  const out = new Map<string, string>();
  for (const summary of await adapter.listMaps()) {
    const snap = await adapter.loadMap(summary.id);
    for (const [id, phase] of derivePhases(snap.tickets, snap.map.mode))
      out.set(`${snap.map.id}/${id}`, syncClass(phase));
  }
  return out;
}

/** A ticket that was there before moved to another class, or is gone. A new ticket changes nothing on a PR. */
function moved(before: Map<string, string>, after: Map<string, string>) {
  for (const [key, cls] of before) if (after.get(key) !== cls) return true;
  return false;
}

/**
 * Runs the PR reconciler (and with it proof posting) soon after a ticket is closed, reopened or removed, or starts or
 * stops being worked on, however it happened: in the Lookout, by an agent over MCP in another process, by a teammate
 * on GitHub or Linear. Without it, a reopened ticket's proof stayed green and the review queue lagged up to a poll.
 * Reads the trails every `pollMs` (as the attention queue does) and kicks once per burst of changes, `debounceMs`
 * after the last. Returns a function that stops it.
 */
export function watchTicketPhases(
  ctx: RouteContext,
  kick: () => void,
  opts: { pollMs?: number; debounceMs?: number } = {},
): () => void {
  let last: Map<string, string> | undefined;
  let busy = false;
  let pending: ReturnType<typeof setTimeout> | undefined;
  const changed = () => {
    clearTimeout(pending);
    pending = setTimeout(kick, opts.debounceMs ?? 1500);
    pending.unref?.();
  };
  const tick = async () => {
    const now = await readClasses(ctx);
    if (last && moved(last, now)) changed();
    last = now;
  };
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    void tick()
      .catch(() => {})
      .finally(() => (busy = false));
  }, opts.pollMs ?? 3000);
  timer.unref?.();
  return () => {
    clearInterval(timer);
    clearTimeout(pending);
  };
}
