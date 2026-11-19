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
import { baselineForClaim, levelFor, recordTypes, repoRootOf } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { checkWarnings } from './checkWarnings';
import { criteriaView } from './criteria';
import { assertCriteriaConfirmed } from './criteriaGate';
import { rulesAtClaim } from './diffRules';
import { assertClaimable, briefView } from './discovery';
import { givenGuides } from './guideChanges';
import { assertInGuides } from './guides';
import { knowledgeFor } from './knowledge';
import { assertMainChecks, mainChecksField, type MainGate } from './mainChecks';
import { stampModel, tierFields } from './models';
import { offerNext, readGates } from './offerNext';
import { heldElsewhere } from './ownClaim';
import { claimParallel } from './parallel';
import { pathRoots } from './pathRoots';
import { recoverStalled } from './recoverStalled';
import { sessionView } from './reporting';
import { assertUnderReviewLimit } from './reviewLimit';
import { assertModelMayReview, reviewModelNote } from './reviewModels';
import { assertMayReview } from './reviews';
import { ticketInfo } from './ticketInfo';
import { baselineView } from './verificationView';
import { workspaceSetupView } from './workspaceSetupView';

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
  const { target, main } = await pickTarget(ctx, { snap, agent, ref: input.ticket, guides: input.guides });
  const alreadyMine =
    target.assignee === agent && deriveStates(snap.tickets, snap.map.mode).get(target.id) === 'claimed';
  const t = alreadyMine
    ? target
    : await claim(ctx.adapter, snap.map.id, target.id, { assignee: agent, journal: ctx.journal });
  const s = await sessionFor(ctx, snap, t);
  stampModel(ctx);
  const guides = givenGuides(ctx.root, snap, t);
  const lease = ctx.leases.hold(agent, snap.map.id, t, { sessionId: s.id, guides });
  const parallel = await claimParallel(ctx, {
    mapId: snap.map.id,
    ticket: t,
    agent,
    touches: input.touches,
    workspace: input.workspace,
  });
  // the type it was claimed as: the trail's level applies by it until the trail lead approves a change
  recordTypes(ctx.root, snap.map.id, [t]);
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
  const warned = await checkWarnings(ctx, fresh, current);
  return {
    claimed: ticketInfo(ctx.root, fresh, current, await ctx.decisions(snap.map.id)),
    ...tierFields(ctx, fresh, current, !!input.ticket),
    ...(await reviewModelNote(ctx, fresh, current)),
    session: sessionView(ctx),
    discovery: briefView(ctx.root, fresh),
    knowledge: delivered,
    criteria: criteriaView(ctx.root, fresh, current, levelFor(ctx.root, fresh, t).info.level),
    ...rulesAtClaim(ctx, input.touches),
    git: ctx.remote ? REMOTE_GIT_NOTE : baselineView(baseline),
    ...mainChecksField(main),
    lease: {
      expiresAt: new Date(lease.expiresAt).toISOString(),
      length: leaseSpan(lease.ttlMs),
      renewedBy: 'every tool call of yours; report_progress notes are kept for whoever resumes if you go silent',
    },
    ...(recovered.length ? { recovered } : {}),
    ...(parallel.workspace ? { workspace: parallel.workspace } : {}),
    ...(parallel.setup ? { workspaceSetup: workspaceSetupView(parallel.setup) } : {}),
    ...(parallel.workspaceNote ? { workspaceNote: parallel.workspaceNote } : {}),
    ...(parallel.warnings.length ? { warnings: parallel.warnings } : {}),
    ...(warned.length ? { checkWarnings: warned } : {}),
  };
}

/** The named ticket, or the one `offerNext` offers; checked against the same gates (offerNext.ts). */
async function pickTarget(
  ctx: AgentContext,
  at: { snap: MapSnapshot; agent: string; ref?: string; guides?: string[] },
): Promise<{ target: Ticket; main: MainGate }> {
  const { snap, agent } = at;
  const offer = at.ref ? undefined : await offerNext(ctx, snap, { guides: at.guides });
  if (offer && !offer.ticket) throw new OperationError(offer.reason ?? 'No ready ticket');
  const gates = offer?.gates ?? (await readGates(ctx, snap));
  const target = offer?.ticket ?? ctx.findTicket(snap, at.ref!);
  const elsewhere = target.assignee === agent ? heldElsewhere(ctx, snap.map.id, target) : undefined;
  if (elsewhere) throw new OperationError(`${elsewhere}: it is not yours to take over.`);
  const proposal = gates.frozen.get(target.id);
  if (proposal && target.assignee !== agent)
    throw new OperationError(`${target.key} is frozen by reroute proposal ${proposal}, waiting on the human`);
  assertMayReview(ctx, snap, target, agent);
  if (target.assignee !== agent) assertModelMayReview(gates.models, target);
  assertUnderReviewLimit(gates.review, target, agent);
  assertMainChecks(gates.main, target, agent);
  if (target.assignee !== agent) assertInGuides(snap, target, at.guides);
  if (target.assignee !== agent) assertClaimable(ctx.root, snap.map.id, target);
  if (target.assignee !== agent) assertCriteriaConfirmed(gates.criteria, target);
  return { target, main: gates.main };
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
