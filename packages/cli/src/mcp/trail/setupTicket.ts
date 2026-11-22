import {
  NEW_REPO_FINDING,
  OperationError,
  type LevelInfo,
  type MapSnapshot,
  type Ticket,
  type TicketType,
} from '@teamtrail/core';
import { checksApproval, readReadiness } from '@teamtrail/core/agents';
import {
  commandLine,
  detectRepoProfile,
  markSetupTicket,
  setupCompletionRefusal,
  setupRefusal,
  suggestChecks,
} from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';
import { readinessHostOf } from './readinessGate';

const CODE_TYPES: TicketType[] = ['task', 'execute'];

/** Repo readiness read afresh: whether the repo is new decides whether a setup ticket may be added. */
async function freshReadiness(ctx: AgentContext) {
  const host = readinessHostOf(ctx);
  return readReadiness({ root: ctx.root, files: host.files(), probe: host.probe, fresh: true });
}

/** Whether readiness says the repo has no project yet (model/setupTicket.ts). */
export async function repoIsNew(ctx: AgentContext): Promise<boolean> {
  const host = readinessHostOf(ctx);
  const readiness = await readReadiness({ root: ctx.root, files: host.files(), probe: host.probe });
  return readiness.findings.some((f) => f.id === NEW_REPO_FINDING);
}

/** Refuses `add_ticket setup: true` before anything is created, unless the repo is new and the trail has none yet. */
export async function assertMaySetUp(ctx: AgentContext, snap: MapSnapshot, type: TicketType) {
  const refused = setupRefusal({ readiness: await freshReadiness(ctx), snap, type });
  if (refused) throw new OperationError(refused);
}

/** Marks the new ticket as the trail's setup ticket and makes every open implementation ticket wait for it. */
export async function markSetup(ctx: AgentContext, snap: MapSnapshot, t: Ticket) {
  await markSetupTicket({
    adapter: ctx.adapter,
    root: ctx.root,
    mapId: snap.map.id,
    ticketId: t.id,
    by: await ctx.agentId(),
  });
  const later = snap.tickets.filter(
    (x) => x.id !== t.id && x.state === 'open' && CODE_TYPES.includes(x.type) && !x.blockedBy.includes(t.id),
  );
  for (const x of later) await ctx.adapter.addBlocking(snap.map.id, t.id, x.id);
}

/** A new implementation ticket on a trail whose setup ticket is still open waits for it, as charted ones do. */
export async function waitForSetup(ctx: AgentContext, snap: MapSnapshot, t: Ticket) {
  const setup = snap.tickets.find((x) => x.setup && x.state === 'open' && x.id !== t.id);
  if (!setup || !CODE_TYPES.includes(t.type) || t.blockedBy.includes(setup.id)) return;
  await ctx.adapter.addBlocking(snap.map.id, setup.id, t.id);
}

/** What reading the repo now suggests as checks, as command lines for the agent to propose. */
async function suggested(ctx: AgentContext): Promise<string[]> {
  const files = readinessHostOf(ctx).files();
  if (!files) return [];
  const profile = await detectRepoProfile(files);
  return suggestChecks(profile).map((c) => `${c.name}: ${commandLine(c.run)}${c.cwd ? ` (in ${c.cwd})` : ''}`);
}

/** Refuses a setup ticket's completion that would be checked by nothing: it proposes the checks first. */
export async function assertSetupProposesChecks(ctx: AgentContext, t: Ticket, info: LevelInfo) {
  if (!t.setup) return;
  const approval = checksApproval(ctx.root);
  const base = { t, info, approval };
  if (!setupCompletionRefusal({ ...base, suggested: [] })) return;
  throw new OperationError(setupCompletionRefusal({ ...base, suggested: await suggested(ctx) })!);
}

/** What a setup completion that waited without an approval adds to the usual note: call close_ticket again after it. */
export const SETUP_WAIT_NOTE =
  ' This is the setup ticket: this call waited for the trail lead to approve the checks you proposed. Once they do, call close_ticket again and they run on this work.';
