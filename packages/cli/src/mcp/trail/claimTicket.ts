import {
  attention,
  chooseNext,
  claim,
  deriveStates,
  leaseSpan,
  OperationError,
  type MapSnapshot,
  type SessionHandle,
  type SessionMode,
  type Ticket,
} from '@teamtrail/core';
import { baselineForClaim, levelFor, repoRootOf } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { criteriaView } from './criteria';
import { assertClaimable, briefView, claimable } from './discovery';
import { knowledgeFor } from './knowledge';
import { claimParallel } from './parallel';
import { recoverStalled } from './recoverStalled';
import { sessionView } from './reporting';
import { frozenOn } from './reroutes';
import { assertMayReview, ownReviews } from './reviews';
import { assertInRoles, outsideRoles } from './roles';
import { ticketInfo } from './ticketInfo';
import { nextTicket } from './ticketOps';
import { baselineView } from './verificationView';

/**
 * `claim_ticket`: claims the given ticket (or the best ready one), opens a session for it,
 * holds the lease and records the git baseline. Returns what the agent needs to start.
 */
export async function claimTicket(
  ctx: AgentContext,
  input: { ticket?: string; trail?: string; touches?: string[]; workspace?: boolean; roles?: string[] } = {},
) {
  const recovered = await recoverStalled(ctx);
  const snap = await ctx.resolveTrail(input.trail);
  ctx.trail = snap.map.id;
  const agent = await ctx.agentId();
  const target = await pickTarget(ctx, { snap, agent, ref: input.ticket, roles: input.roles });
  const alreadyMine =
    target.assignee === agent && deriveStates(snap.tickets, snap.map.mode).get(target.id) === 'claimed';
  const t = alreadyMine
    ? target
    : await claim(ctx.adapter, snap.map.id, target.id, { assignee: agent, journal: ctx.journal });
  const s = await sessionFor(ctx, snap, t);
  const lease = ctx.leases.hold(agent, snap.map.id, t, { sessionId: s.id });
  const parallel = await claimParallel(ctx, {
    mapId: snap.map.id,
    ticket: t,
    agent,
    touches: input.touches,
    workspace: input.workspace,
  });
  const baseline = await baselineForClaim({
    root: ctx.root,
    cwd: parallel.workspace?.path ?? repoRootOf(ctx.verifyEnv()),
    mapId: snap.map.id,
    ticket: t,
    agent,
    sessionId: s.id,
    resume: t === target || target.status === 'rework',
  });
  const fresh = await ctx.load(snap.map.id);
  const current = fresh.tickets.find((x) => x.id === t.id)!;
  const delivered = knowledgeFor(ctx.root, fresh, t);
  if (delivered) s.log(`knowledge delivered: ${delivered.map((k) => k.id).join(', ')}`);
  return {
    claimed: ticketInfo(ctx.root, fresh, current, await ctx.decisions(snap.map.id)),
    session: sessionView(ctx),
    discovery: briefView(ctx.root, fresh),
    knowledge: delivered,
    criteria: criteriaView(ctx.root, fresh, current, levelFor(ctx.root, fresh, t).info.level),
    git: baselineView(baseline),
    lease: {
      expiresAt: new Date(lease.expiresAt).toISOString(),
      length: leaseSpan(lease.ttlMs),
      renewedBy: 'every tool call of yours; report_progress notes are kept for whoever resumes if you go silent',
    },
    ...(recovered.length ? { recovered } : {}),
    ...(parallel.workspace ? { workspace: parallel.workspace } : {}),
    ...(parallel.workspaceNote ? { workspaceNote: parallel.workspaceNote } : {}),
    ...(parallel.warnings.length ? { warnings: parallel.warnings } : {}),
  };
}

/** The named ticket, or the best ready one; checked against review and discovery rules. */
async function pickTarget(
  ctx: AgentContext,
  at: { snap: MapSnapshot; agent: string; ref?: string; roles?: string[] },
): Promise<Ticket> {
  const { snap, agent } = at;
  const frozen = frozenOn(ctx, snap.map.id);
  const exclude = [...(await ownReviews(ctx, snap, agent)), ...frozen.keys(), ...outsideRoles(snap, at.roles)];
  const target = at.ref
    ? ctx.findTicket(snap, at.ref)
    : chooseNext(snap, { types: claimable(ctx.root, snap.map.id), exclude });
  if (!target) {
    const r = await nextTicket(ctx, { trail: snap.map.id, roles: at.roles });
    throw new OperationError(('reason' in r ? r.reason : undefined) ?? 'No ready ticket');
  }
  const proposal = frozen.get(target.id);
  if (proposal && target.assignee !== agent)
    throw new OperationError(`${target.key} is frozen by reroute proposal ${proposal}, waiting on the human`);
  assertMayReview(ctx, snap, target, agent);
  if (target.assignee !== agent) assertInRoles(target, at.roles);
  if (target.assignee !== agent) assertClaimable(ctx.root, snap.map.id, target);
  return target;
}

/** Reuses an idle session of the right mode on this trail, or opens one, and moves it to the claim steps. */
async function sessionFor(ctx: AgentContext, snap: MapSnapshot, t: Ticket): Promise<SessionHandle> {
  const mode: SessionMode = t.type === 'research' ? 'research' : 'work';
  const cur = ctx.sessions.running();
  const idle = cur && cur.info.mode === mode && cur.info.mapId === snap.map.id && !cur.info.ticketId;
  let s: SessionHandle;
  if (idle) s = cur;
  else {
    s = await ctx.open(mode, snap.map.id, t.id);
    if (mode === 'work') s.step(1, 'reading trail + tickets');
  }
  if (mode === 'research') {
    s.step(1, t.key, t.id);
    s.step(2, t.title);
  } else {
    const who = attention(t) === 'hitl' ? 'with you' : 'agent only';
    s.step(2, `${t.key} ${t.title}`, t.id);
    s.step(3, `${t.key} ${t.type} · ${who}`);
  }
  return s;
}
