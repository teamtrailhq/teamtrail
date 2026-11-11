import {
  frozenTickets,
  settingAsk,
  settingText,
  type DestinationReason,
  type MapSnapshot,
  type RerouteChange,
  type RerouteKind,
  type RerouteProposal,
} from '@teamtrail/core';
import { listReroutes, proposeReroute, readReroute, RerouteInvalid } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import type { WaitControl } from './types';

export interface ProposeArgs {
  trail?: string;
  /** `rule-out`: close_ticket out_of_scope (ruleOut.ts); `setting`: a trail lead's setting (settings.ts). */
  lane?: 'rule-out' | 'setting';
  kind?: RerouteKind;
  destinationReason?: DestinationReason;
  reason: string;
  evidence: string;
  invalidates?: string[];
  changes: RerouteChange[];
}

/**
 * `propose_reroute`: ticket keys become ids (new refs stay refs), the engine validates the proposal and stores it.
 * Validation problems come back as `{ status: 'invalid', errors }`, so the agent can fix and propose again.
 */
export async function proposeRerouteOp(ctx: AgentContext, input: ProposeArgs) {
  const snap = await ctx.resolveTrail(input.trail);
  const by = await ctx.agentId();
  const s = await ctx.ensureSession();
  try {
    const r = await proposeReroute(
      { root: ctx.root, adapter: ctx.adapter, journal: ctx.journal },
      {
        mapId: snap.map.id,
        kind: input.kind ?? 'reroute',
        destinationReason: input.destinationReason,
        reason: input.reason,
        evidence: input.evidence,
        invalidates: input.invalidates ?? [],
        changes: withIds(ctx, snap, input.changes),
        by,
        sessionId: s.id,
        origin: ctx.origin,
        ...(input.lane ? { lane: input.lane } : {}),
      },
    );
    s.log(`proposed ${r.proposal.id} · ${r.proposal.changes.length} changes · waiting on the human`, 'warn');
    return {
      id: r.proposal.id,
      status: r.proposal.status,
      kind: r.proposal.kind,
      diff: r.diff,
      frozen: r.frozen.map((id) => ctx.keyOf(id)),
      ...(r.proposal.wide
        ? {
            wide: `It touches ${r.proposal.wide.touched} of ${r.proposal.wide.open} open tickets, so it freezes nothing: the human is asked to decide it, and the current plan stands until they do.`,
          }
        : {}),
      next: 'The human reviews it in the Lookout. Keep working on tickets it does not freeze; reroute_status (wait: true) returns the decision.',
    };
  } catch (e) {
    if (e instanceof RerouteInvalid) return { status: 'invalid', errors: e.errors };
    throw e;
  }
}

/** `reroute_status`: a proposal's decision (default: your latest on the trail); `wait` blocks until it's decided. */
export async function rerouteStatus(
  ctx: AgentContext,
  input: { trail?: string; id?: string; wait?: boolean; waitSeconds?: number },
  defaultWait: number,
  ctl: WaitControl,
) {
  const snap = await ctx.resolveTrail(input.trail);
  const agent = await ctx.agentId();
  const id =
    input.id ??
    listReroutes(ctx.root, snap.map.id)
      .filter((p) => p.by === agent)
      .at(-1)?.id;
  if (!id) return { reroute: null, hint: 'You have no proposal on this trail.' };
  let p = readReroute(ctx.root, snap.map.id, id);
  if (input.wait && p?.status === 'pending')
    p = await waitForDecision(ctx, p, (input.waitSeconds ?? defaultWait) * 1000, ctl);
  if (!p) return { reroute: null, hint: `No proposal ${id} on this trail.` };
  return { reroute: await statusView(ctx, snap.map.id, p) };
}

async function waitForDecision(ctx: AgentContext, p: RerouteProposal, limitMs: number, ctl: WaitControl) {
  const started = Date.now();
  let lastBeat = started;
  let cur: RerouteProposal | undefined = p;
  while (cur?.status === 'pending' && Date.now() - started < limitMs && !ctl.signal?.aborted) {
    await new Promise((r) => setTimeout(r, 1000));
    cur = readReroute(ctx.root, p.mapId, p.id);
    if (Date.now() - lastBeat < 15_000) continue;
    lastBeat = Date.now();
    ctx.heartbeat();
    ctl.onProgress?.(Math.round((lastBeat - started) / 1000));
  }
  return cur;
}

async function statusView(ctx: AgentContext, mapId: string, p: RerouteProposal) {
  const fresh = await ctx.load(mapId);
  const keyOf = (id: string) => fresh.tickets.find((t) => t.id === id)?.key ?? id;
  return {
    id: p.id,
    kind: p.kind,
    status: p.status,
    ...(p.note ? { note: p.note } : {}),
    ...(p.decidedBy ? { decidedBy: p.decidedBy } : {}),
    ...(p.supersededBy ? { supersededBy: p.supersededBy } : {}),
    applied: `${p.applied.length} of ${p.changes.length}`,
    created: Object.values(p.created).map(keyOf),
    next: p.lane === 'setting' ? SETTING_NEXT[p.status](p) : NEXT[p.status],
  };
}

const SETTING_NEXT: Record<RerouteProposal['status'], (p: RerouteProposal) => string> = {
  pending: (p) =>
    `Still waiting on the human to approve or decline: ${settingAsk(p)}. Nothing changes until they approve.`,
  approved: (p) => `Approved: the trail lead agreed to ${settingText(p.changes[0])}, and it is done.`,
  rejected: (p) =>
    `Declined: the trail lead said no to ${settingText(p.changes[0])}${p.note ? ` (${p.note})` : ''}. Don't do it; carry on as the trail is.`,
  superseded: () => 'Replaced by a newer request.',
};

const NEXT: Record<RerouteProposal['status'], string> = {
  pending: 'Still waiting on the human. Keep working on tickets the proposal does not freeze.',
  approved: 'Approved and applied: next_ticket picks from the new plan.',
  rejected: 'Rejected: read the note, then propose again or carry on with the current plan.',
  superseded: 'Replaced by your newer proposal.',
};

/** Ticket keys (`#12`) to ids; refs the proposal adds stay as they are; unknown refs are left for validation. */
function withIds(ctx: AgentContext, snap: MapSnapshot, changes: RerouteChange[]): RerouteChange[] {
  const newRefs = new Set(changes.flatMap((c) => (c.op === 'add_ticket' ? [c.ref] : [])));
  const id = (ref: string) => {
    if (newRefs.has(ref)) return ref;
    try {
      return ctx.findTicket(snap, ref).id;
    } catch {
      return ref;
    }
  };
  return changes.map((c) => {
    if (c.op === 'add_ticket') return { ...c, blockedBy: (c.blockedBy ?? []).map(id) };
    if (c.op === 'rewire')
      return {
        ...c,
        ticket: id(c.ticket),
        ...(c.addBlockedBy ? { addBlockedBy: c.addBlockedBy.map(id) } : {}),
        ...(c.removeBlockedBy ? { removeBlockedBy: c.removeBlockedBy.map(id) } : {}),
      };
    if ('ticket' in c) return { ...c, ticket: id(c.ticket) };
    return c;
  });
}

/** Ticket id → proposal id, for the trail's pending proposals. */
export const frozenOn = (ctx: AgentContext, mapId: string) => frozenTickets(listReroutes(ctx.root, mapId));

/** What status and resume show: challenged assumptions and pending proposals; undefined when there are none. */
export function adaptiveView(ctx: AgentContext, snap: MapSnapshot) {
  const challenged = (snap.map.sections.assumptions ?? []).filter((a) => a.status === 'challenged');
  const pending = listReroutes(ctx.root, snap.map.id).filter((p) => p.status === 'pending');
  if (!challenged.length && !pending.length) return undefined;
  const frozen = frozenTickets(pending);
  return {
    challengedAssumptions: challenged.map((a) => ({ id: a.id, text: a.text, evidence: a.challenge?.evidence })),
    pendingReroutes: pending.map((p) => ({
      id: p.id,
      kind: p.kind,
      by: p.by,
      reason: p.reason,
      frozen: [...frozen].filter(([, r]) => r === p.id).map(([t]) => ctx.keyOf(t)),
    })),
  };
}
