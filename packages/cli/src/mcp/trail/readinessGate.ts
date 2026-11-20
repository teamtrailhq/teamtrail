import { OperationError, type MapSnapshot, type Ticket } from '@teamtrail/core';
import { localRepoFiles, readinessHold, readReadiness, repoRootOf, type ReadinessHold } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * Repo readiness on one trail as a claim sees it (readiness/ in core): the blocking findings, the ready implementation
 * tickets they hold back, and why. Read from this machine's checkout and probed here, unless the server runs checks
 * elsewhere (its own runner): then nothing about this machine is probed. Kept for a few seconds between claims.
 */
export async function readinessGate(ctx: AgentContext, snap: MapSnapshot): Promise<ReadinessHold> {
  const files = localRepoFiles(repoRootOf(ctx.verifyEnv()));
  const readiness = await readReadiness({ root: ctx.root, files, probe: !ctx.opts.checkRunner });
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
