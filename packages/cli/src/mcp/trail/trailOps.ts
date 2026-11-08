import { deriveStates, type MapMode } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { addTrailAssumptions, type AssumptionPlanInput } from './assumptions';
import { attentionSummary } from './attention';
import { deliveryView } from './deliveryView';
import { briefView, claimable } from './discovery';
import { knowledgeFor } from './knowledge';
import { matchingView, pickNext, stampModel } from './models';
import { parallelView } from './parallel';
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
  },
) {
  const snap = await ctx.resolveTrail(input.trail);
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
  return (await status(ctx, snap.map.id)).trail;
}
