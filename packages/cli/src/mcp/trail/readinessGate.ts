import { OperationError, type MapSnapshot, type ReadinessHost, type Ticket } from '@teamtrail/core';
import { readinessHold, readinessHost, readReadiness, type ReadinessHold } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * Where readiness is read for this agent: the embedding server's host when it set one, else this machine's checkout
 * of the repo, probed here unless the server's runner runs the checks (readiness/readinessHost.ts in core).
 */
export function readinessHostOf(ctx: AgentContext): ReadinessHost {
  return readinessHost({ root: ctx.root, host: ctx.opts.readiness, checkRunner: ctx.opts.checkRunner });
}

/**
 * Repo readiness on one trail as a claim sees it (readiness/ in core): the blocking findings, the ready implementation
 * tickets they hold back, and why. Kept for a few seconds between claims (readReadiness.ts).
 */
export async function readinessGate(ctx: AgentContext, snap: MapSnapshot): Promise<ReadinessHold> {
  const host = readinessHostOf(ctx);
  const readiness = await readReadiness({ root: ctx.root, files: host.files(), probe: host.probe });
  return readinessHold({ root: ctx.root, snap, readiness });
}

/** Refuses an explicit claim of new implementation work readiness holds back. Own claims and rework go on. */
export function assertReady(gate: ReadinessHold, t: Ticket, agent: string) {
  if (t.assignee === agent || !gate.reason) return;
  if (gate.held.some((h) => h.id === t.id)) throw new OperationError(gate.reason);
}

/** `readiness` on next and claim results while it holds work back, so the agent can tell the human. */
export const readinessField = (gate: ReadinessHold) =>
  gate.reason ? { readiness: { waits: gate.reason, lookout: 'Settings → Project → Repo readiness' } } : {};
