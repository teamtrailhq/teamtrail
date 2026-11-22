import { checksApproval } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import type { WaitControl } from './types';

/** How often the approval is looked at, and how often the agent's lease is renewed and progress sent. */
const LOOK_MS = 2000;
const PROGRESS_MS = 15_000;

/**
 * Waits up to `seconds` for the trail lead to approve the check commands (Settings → Approvals), so a setup ticket's
 * completion (model/setupTicket.ts) goes on by itself once they did, instead of the agent calling close_ticket again.
 * Renews the lease and sends progress every 15 s, like the other waits. True once nothing waits for approval.
 */
export async function awaitChecksApproval(ctx: AgentContext, seconds: number, ctl: WaitControl): Promise<boolean> {
  const started = Date.now();
  const until = started + seconds * 1000;
  let told = started;
  while (Date.now() < until && !ctl.signal?.aborted) {
    if (!checksApproval(ctx.root).waiting) return true;
    await new Promise((r) => setTimeout(r, Math.min(LOOK_MS, Math.max(0, until - Date.now()))));
    if (Date.now() - told >= PROGRESS_MS) {
      told = Date.now();
      ctx.heartbeat();
      ctl.onProgress?.(Math.round((told - started) / 1000));
    }
  }
  return !checksApproval(ctx.root).waiting;
}
