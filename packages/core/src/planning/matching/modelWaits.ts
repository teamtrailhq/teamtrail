import { MODEL_TIERS, type ModelTier } from '../../model/modelTier';
import type { MapSnapshot } from '../../model/types';
import { deriveStates } from '../derive';
import { tierOfTicket } from './tierOfTicket';
import { tierRank } from './tierRank';

/** An agent connected to this project now, with the tier of the model it runs on. */
export interface ConnectedAgent {
  agent: string;
  tier: ModelTier;
  model?: string;
}

/** A ready ticket no connected agent is strong enough to take on its own. */
export interface ModelWait {
  mapId: string;
  ticketId: string;
  ticketKey: string;
  title: string;
  /** The tier the ticket is set for. */
  tier: ModelTier;
  /** The strongest tier among connected agents. */
  best: ModelTier;
  since: number;
}

/**
 * Ready tickets on a trail with model matching on that wait for a stronger model than any connected agent runs.
 * Nothing waits when matching is off or no agent is connected: then nobody would take the ticket anyway.
 */
export function modelWaits(snap: MapSnapshot, agents: ConnectedAgent[]): ModelWait[] {
  if (!snap.map.modelMatching?.enabled || !agents.length) return [];
  const best = MODEL_TIERS[Math.max(...agents.map((a) => tierRank(a.tier)))];
  const states = deriveStates(snap.tickets, snap.map.mode);
  return snap.tickets.flatMap((t): ModelWait[] => {
    const state = states.get(t.id);
    const ready = (state === 'frontier' || state === 'rework') && !t.assignee;
    const tier = tierOfTicket(t, snap.map);
    if (!ready || tierRank(tier) <= tierRank(best)) return [];
    return [{ mapId: snap.map.id, ticketId: t.id, ticketKey: t.key, title: t.title, tier, best, since: t.updatedAt }];
  });
}
