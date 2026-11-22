import { NEW_REPO_FINDING, OperationError, type MapSnapshot, type ReadinessHost, type Ticket } from '@teamtrail/core';
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

const NEW_REPO =
  'New repo: no project yet. Chart "Set up the project" as its first implementation ticket (add_ticket with setup: true); ' +
  'it builds the project skeleton with a test and proposes the checks with propose_checks. Every other task waits for it.';

/**
 * `readiness` on next and claim results while it holds work back, so the agent can tell the human; on a new repo
 * whose trail has no setup ticket yet, `newRepo` says to chart one first (model/setupTicket.ts).
 */
export function readinessField(gate: ReadinessHold, snap?: MapSnapshot) {
  const fresh = gate.findings.some((f) => f.id === NEW_REPO_FINDING) && !snap?.tickets.some((t) => t.setup);
  if (!gate.reason && !fresh) return {};
  const waits = gate.reason ? { waits: gate.reason, lookout: 'Settings → Project → Repo readiness' } : {};
  return { readiness: { ...waits, ...(fresh ? { newRepo: NEW_REPO } : {}) } };
}
