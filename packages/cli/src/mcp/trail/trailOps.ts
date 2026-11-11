import { deriveStates, OperationError, type MapMode, type MapSnapshot } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { addTrailAssumptions, type AssumptionPlanInput } from './assumptions';
import { attentionSummary } from './attention';
import { deliveryView } from './deliveryView';
import { briefView, claimable } from './discovery';
import type { HumanAnswer } from './humanAnswer';
import { humanCallFor, recordHumanCall, releaseHumanCall } from './humanCall';
import { knowledgeFor } from './knowledge';
import { matchingView, pickNext, stampModel } from './models';
import { parallelView } from './parallel';
import type { QuestionAbout } from './questionAbout';
import { adaptiveView, frozenOn } from './reroutes';
import { ticketInfo } from './ticketInfo';
import { trailView } from './views';

export async function status(ctx: AgentContext, trailRef?: string) {
  const maps = await ctx.adapter.listMaps();
  ctx.flush();
  const docs = await readAgentDocs(ctx.root);
  const trails = await Promise.all(
    maps.map(async (m) => {
      const s = await ctx.load(m.id);
      return {
        id: m.id,
        key: m.key,
        title: m.title,
        decided: s.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed').length,
        tickets: s.tickets.length,
      };
    }),
  );
  const base = {
    agent: await ctx.agentId(),
    lookout: ctx.lookout(),
    trails,
    attention: await attentionSummary(ctx),
  };
  if (!maps.length) return { ...base, trail: null, hint: 'No trails yet. Start one with start_trail.' };
  const snap = await ctx.resolveTrail(trailRef);
  const records = await ctx.decisions(snap.map.id);
  return {
    ...base,
    trail: trailView(snap, docs, records, (id) => ctx.keyOf(id)),
    delivery: deliveryView(ctx.root, snap, docs),
    adaptive: adaptiveView(ctx, snap),
    parallel: parallelView(ctx, snap),
    modelMatching: matchingView(ctx, snap),
  };
}

export async function resumeTrail(ctx: AgentContext, trailRef?: string) {
  const snap = await ctx.resolveTrail(trailRef);
  ctx.trail = snap.map.id;
  const cur = ctx.sessions.running();
  if (!cur || cur.info.mapId !== snap.map.id) (await ctx.open('work', snap.map.id)).step(1, 'reading trail + tickets');
  stampModel(ctx);
  const current = await status(ctx, snap.map.id);
  const agent = await ctx.agentId();
  const states = deriveStates(snap.tickets, snap.map.mode);
  const mine = snap.tickets.find((t) => states.get(t.id) === 'claimed' && t.assignee === agent);
  const exclude = [...frozenOn(ctx, snap.map.id).keys()];
  const next = pickNext(ctx, snap, { types: claimable(ctx.root, snap.map.id), exclude }).ticket;
  return {
    ...current,
    discovery: briefView(ctx.root, snap),
    yourClaim: mine ? ticketInfo(ctx.root, snap, mine, await ctx.decisions(snap.map.id)) : null,
    next: next ? ticketInfo(ctx.root, snap, next, await ctx.decisions(snap.map.id)) : null,
    knowledge: mine || next ? knowledgeFor(ctx.root, snap, (mine ?? next)!) : undefined,
  };
}

export async function updateTrail(
  ctx: AgentContext,
  input: {
    trail?: string;
    destination?: string;
    notes?: string;
    addUnspecified?: string[];
    addOutOfScope?: string[];
    addAssumptions?: AssumptionPlanInput[];
    mode?: MapMode;
    questionId?: string;
  },
) {
  const snap = await ctx.resolveTrail(input.trail);
  const call = humanChange(snap, input);
  const answer = call && humanCallFor(ctx, call, input.questionId);
  try {
    return await applyUpdate(ctx, { snap, input, answer, call });
  } catch (e) {
    releaseHumanCall(answer);
    throw e;
  }
}

/**
 * The trail lead's setting this update changes, if any: the mode or the destination, when they differ from what the
 * trail has. One per call, since one answer backs one change.
 */
function humanChange(snap: MapSnapshot, input: { mode?: MapMode; destination?: string }): QuestionAbout | undefined {
  const mode = input.mode && input.mode !== snap.map.mode ? input.mode : undefined;
  const dest = input.destination?.trim();
  const destination = dest && dest !== snap.map.sections.destination.trim() ? input.destination : undefined;
  if (mode && destination)
    throw new OperationError(
      'Change the mode and the destination in two calls: each needs its own answer from the human.',
    );
  if (mode) return { kind: 'mode', mode };
  return destination ? { kind: 'destination', destination } : undefined;
}

async function applyUpdate(
  ctx: AgentContext,
  c: { snap: MapSnapshot; input: Parameters<typeof updateTrail>[1]; answer?: HumanAnswer; call?: QuestionAbout },
) {
  const { snap, input } = c;
  const s = await ctx.ensureSession();
  const sec = snap.map.sections;
  const patch = {
    ...(input.destination !== undefined ? { destination: input.destination } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.addUnspecified?.length
      ? { unspecified: [...sec.unspecified, ...input.addUnspecified.filter((x) => !sec.unspecified.includes(x))] }
      : {}),
    ...(input.addOutOfScope?.length ? { outOfScope: [...sec.outOfScope, ...input.addOutOfScope] } : {}),
  };
  if (Object.keys(patch).length) await ctx.adapter.updateMapSections(snap.map.id, patch);
  if (input.mode && input.mode !== snap.map.mode) await ctx.adapter.setMapMode(snap.map.id, input.mode);
  const added = input.addAssumptions?.length ? await addTrailAssumptions(ctx, snap, input.addAssumptions) : [];
  const changed = [...Object.keys(patch), ...(input.mode ? ['mode'] : []), ...(added.length ? ['assumptions'] : [])];
  s.log(`trail updated · ${changed.join(', ') || 'no change'}`);
  if (c.answer && c.call) await recordHumanCall(ctx, { answer: c.answer, snap, about: c.call });
  return (await status(ctx, snap.map.id)).trail;
}
