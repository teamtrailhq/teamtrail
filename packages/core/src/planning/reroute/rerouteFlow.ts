import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind, JournalEntry, RerouteAction } from '../../model/lifecycle';
import type { RerouteError, RerouteProposal } from '../../model/reroute';
import { OperationError } from '../operations/operationError';
import { frozenTickets } from './frozenTickets';
import { rerouteDiff } from './rerouteDiff';
import { createReroute, listReroutes, writeReroute } from './rerouteStore';
import { validateReroute, type RerouteDraft } from './validateReroute';

/** Where reroute steps run: the tracker folder, the active adapter and the trail journal. */
export interface RerouteEnv {
  root: string;
  adapter: TrackerAdapter;
  /** The trail history (`journalFile`): reroute steps and the transitions applying them. */
  journal: { append(entry: JournalEntry): void | Promise<void> };
}

/** A proposal the engine refused; `errors` name the change each problem is in. */
export class RerouteInvalid extends OperationError {
  constructor(readonly errors: RerouteError[]) {
    super(
      `the proposal has ${errors.length} problem${errors.length === 1 ? '' : 's'}: ${errors.map(errorLine).join('; ')}`,
    );
  }
}

const errorLine = (e: RerouteError) => (e.change === undefined ? e.message : `change ${e.change + 1}: ${e.message}`);

export interface ProposeInput extends RerouteDraft {
  mapId: string;
  by: string;
  sessionId?: string;
  /** Who is behind the agent (`token:<id>`, `local:<id>`): one origin has one pending proposal per trail. */
  origin?: string;
  at?: number;
}

/** Pending proposals a trail holds at most: past that, a new one waits until the trail lead decides one. */
export const MAX_PENDING_PER_TRAIL = 3;
/**
 * A proposal that would freeze more than this share of the trail's open tickets (and at least `WIDE_MIN` of them)
 * freezes nothing: one proposal must not stop a whole trail. The trail lead is asked instead.
 */
export const WIDE_SHARE = 0.5;
export const WIDE_MIN = 3;

/** How much of the trail's open work the proposal would freeze, when that is too much to freeze. */
function wideness(snap: Parameters<typeof rerouteDiff>[0], input: RerouteDraft) {
  const open = new Set(snap.tickets.filter((t) => t.state === 'open').map((t) => t.id));
  const touched = new Set([...frozenTickets([{ id: '', status: 'pending', changes: input.changes }]).keys()]);
  const hit = [...touched].filter((id) => open.has(id)).length;
  return hit >= WIDE_MIN && hit > open.size * WIDE_SHARE ? { touched: hit, open: open.size } : undefined;
}

/** Earlier pending proposals the new one replaces: the same agent's, or any from the same origin (token). */
const replaces = (old: RerouteProposal, input: ProposeInput) =>
  old.status === 'pending' && (old.by === input.by || (!!input.origin && old.origin === input.origin));

function assertRoom(root: string, input: ProposeInput) {
  const others = listReroutes(root, input.mapId).filter((p) => p.status === 'pending' && !replaces(p, input));
  if (others.length >= MAX_PENDING_PER_TRAIL)
    throw new OperationError(
      `${others.length} reroute proposals already wait on the human for this trail (${others.map((p) => p.id).join(', ')}). Keep working on the current plan until they decide one.`,
    );
}

/**
 * Validates and stores a proposal, which freezes the tickets it touches until the trail lead decides. The same agent's
 * (or the same token's) earlier pending proposal on the trail is superseded. A trail holds at most
 * MAX_PENDING_PER_TRAIL pending proposals, and one touching most of its open work freezes nothing (`wide`): the trail
 * lead is asked instead. Returns it with the dry-run diff and the frozen tickets.
 */
export async function proposeReroute(env: RerouteEnv, input: ProposeInput) {
  const snap = await env.adapter.loadMap(input.mapId);
  const decisions = await env.adapter.listDecisions(input.mapId);
  const errors = validateReroute(snap, decisions, input);
  if (errors.length) throw new RerouteInvalid(errors);
  assertRoom(env.root, input);
  const at = input.at ?? Date.now();
  const wide = wideness(snap, input);
  const proposal = createReroute(env.root, {
    v: 1,
    mapId: input.mapId,
    kind: input.kind,
    ...(input.kind === 'challenge-destination' ? { destinationReason: input.destinationReason } : {}),
    by: input.by,
    sessionId: input.sessionId,
    ...(input.origin ? { origin: input.origin } : {}),
    ...(wide ? { wide } : {}),
    at,
    reason: input.reason.trim(),
    evidence: input.evidence.trim(),
    invalidates: input.invalidates,
    changes: input.changes,
    status: 'pending',
    applied: [],
    created: {},
  });
  journal(env, proposal, { action: 'proposed', actor: input.by, actorKind: 'agent', reason: proposal.reason });
  for (const old of listReroutes(env.root, input.mapId)) {
    if (old.id === proposal.id || !replaces(old, input)) continue;
    writeReroute(env.root, { ...old, status: 'superseded', supersededBy: proposal.id, decidedAt: at });
    journal(env, old, { action: 'superseded', actor: input.by, actorKind: 'agent', reason: `by ${proposal.id}` });
  }
  return { proposal, ...rerouteView(env.root, snap, proposal) };
}

/** The dry-run diff and the tickets the trail's pending proposals freeze. */
export function rerouteView(root: string, snap: Parameters<typeof rerouteDiff>[0], p: RerouteProposal) {
  const frozen = frozenTickets(listReroutes(root, p.mapId));
  const mine = [...frozen].filter(([, id]) => id === p.id).map(([ticket]) => ticket);
  return { diff: rerouteDiff(snap, p.changes), frozen: mine };
}

/** Appends a reroute step to the trail's history. */
export function journal(
  env: Pick<RerouteEnv, 'journal'>,
  p: RerouteProposal,
  step: { action: RerouteAction; actor: string; actorKind: ActorKind; reason?: string; changes?: number },
) {
  void env.journal.append({
    v: 1,
    kind: 'reroute',
    at: Date.now(),
    mapId: p.mapId,
    rerouteId: p.id,
    action: step.action,
    actor: step.actor,
    actorKind: step.actorKind,
    ...(step.reason ? { reason: step.reason } : {}),
    ...(step.changes !== undefined ? { changes: step.changes } : {}),
  });
}
