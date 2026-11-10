import {
  attention,
  claim,
  deriveStates,
  leaseSpan,
  OperationError,
  repoPaths,
  type MapSnapshot,
  type SessionHandle,
  type SessionMode,
  type Ticket,
} from '@teamtrail/core';
import { baselineForClaim, levelFor, repoRootOf } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { criteriaView } from './criteria';
import { assertClaimable, briefView, claimable } from './discovery';
import { assertInGuides, outsideGuides } from './guides';
import { knowledgeFor } from './knowledge';
import { pickNext, stampModel, tierFields } from './models';
import { heldElsewhere } from './ownClaim';
import { claimParallel } from './parallel';
import { pathRoots } from './pathRoots';
import { recoverStalled } from './recoverStalled';
import { sessionView } from './reporting';
import { frozenOn } from './reroutes';
import { assertMayReview, ownReviews } from './reviews';
import { ticketInfo } from './ticketInfo';
import { nextTicket } from './ticketOps';
import { baselineView } from './verificationView';

/** A remote agent's checkout isn't this machine's: the baseline recorded here says nothing about its files. */
const REMOTE_GIT_NOTE = {
  note: "Remote connection: Teamtrail can't see your checkout, so your changes are not tracked. A verified completion goes to the human with your branch or pull request instead of local checks.",
};

/**
 * `claim_ticket`: claims the given ticket (or the best ready one), opens a session for it,
 * holds the lease and records the git baseline. Returns what the agent needs to start.
 */
export async function claimTicket(
  ctx: AgentContext,
  input: { ticket?: string; trail?: string; touches?: string[]; workspace?: boolean; guides?: string[] } = {},
) {
  repoPaths(input.touches, pathRoots(ctx)); // refuses a path outside the repo before anything is claimed
  const recovered = await recoverStalled(ctx);
  const snap = await ctx.resolveTrail(input.trail);
  ctx.trail = snap.map.id;
  const agent = await ctx.agentId();
  const target = await pickTarget(ctx, { snap, agent, ref: input.ticket, guides: input.guides });
  const alreadyMine =
    target.assignee === agent && deriveStates(snap.tickets, snap.map.mode).get(target.id) === 'claimed';
  const t = alreadyMine
    ? target
    : await claim(ctx.adapter, snap.map.id, target.id, { assignee: agent, journal: ctx.journal });
  const s = await sessionFor(ctx, snap, t);
  stampModel(ctx);
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
    ...tierFields(ctx, fresh, current, !!input.ticket),
    session: sessionView(ctx),
    discovery: briefView(ctx.root, fresh),
    knowledge: delivered,
    criteria: criteriaView(ctx.root, fresh, current, levelFor(ctx.root, fresh, t).info.level),
    git: ctx.remote ? REMOTE_GIT_NOTE : baselineView(baseline),
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
  at: { snap: MapSnapshot; agent: string; ref?: string; guides?: string[] },
): Promise<Ticket> {
  const { snap, agent } = at;
  const frozen = frozenOn(ctx, snap.map.id);
  const exclude = [...(await ownReviews(ctx, snap, agent)), ...frozen.keys(), ...outsideGuides(snap, at.guides)];
  const target = at.ref
    ? ctx.findTicket(snap, at.ref)
    : pickNext(ctx, snap, { types: claimable(ctx.root, snap.map.id), exclude }).ticket;
  if (!target) {
    const r = await nextTicket(ctx, { trail: snap.map.id, guides: at.guides });
    throw new OperationError(('reason' in r ? r.reason : undefined) ?? 'No ready ticket');
  }
  const elsewhere = target.assignee === agent ? heldElsewhere(ctx, snap.map.id, target) : undefined;
  if (elsewhere) throw new OperationError(`${elsewhere}: it is not yours to take over.`);
  const proposal = frozen.get(target.id);
  if (proposal && target.assignee !== agent)
    throw new OperationError(`${target.key} is frozen by reroute proposal ${proposal}, waiting on the human`);
  assertMayReview(ctx, snap, target, agent);
  if (target.assignee !== agent) assertInGuides(target, at.guides);
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
