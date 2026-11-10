import { leaseHealth, OperationError, type Ticket } from '@teamtrail/core';
import { readLease } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Why a claim under this agent's trail name is not this connection's: another live connection holds it. A trail
 * name is not an identity (two processes can be started with the same `--agent`), so the claim's lease says who is
 * behind it. A lease that ran out, or whose process is gone, is nobody's: the same agent, back after a restart,
 * picks its claim up again.
 */
export function heldElsewhere(ctx: AgentContext, mapId: string, t: Ticket): string | undefined {
  const lease = readLease(ctx.root, mapId, t.id);
  if (!lease || lease.returned || !lease.origin || lease.origin === ctx.origin) return undefined;
  if (leaseHealth(lease) === 'expired' || !alive(lease.pid)) return undefined;
  return `${t.key} is held by another connection using the trail name ${lease.agent}`;
}

/**
 * Refuses unless `t` is this agent's own claim: assigned to its trail name, and not held by another connection
 * under that name. Every tool that changes a claimed ticket (release, close, complete, criteria, review) asks here.
 */
export function assertOwnClaim(ctx: AgentContext, at: { mapId: string; ticket: Ticket; agent: string }) {
  const { ticket: t, agent } = at;
  if (t.assignee !== agent)
    throw new OperationError(`${t.key} is not claimed by you${t.assignee ? ` (assignee: ${t.assignee})` : ''}`);
  const elsewhere = heldElsewhere(ctx, at.mapId, t);
  if (elsewhere) throw new OperationError(`${elsewhere}. Only the connection that claimed it may change it.`);
}
