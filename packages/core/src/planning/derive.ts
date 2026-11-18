import {
  DEFAULT_MAP_MODE,
  type Attention,
  type MapMode,
  type NodeState,
  type Ticket,
  type TicketType,
} from '../model/types';

export function attention(t: Pick<Ticket, 'type' | 'hitl'>): Attention {
  if (t.type === 'junction' || t.type === 'prototype') return 'hitl';
  if (t.type === 'research') return 'afk';
  return t.hitl ? 'hitl' : 'afk';
}

/** Types whose HITL/AFK mode is chosen per ticket. */
export const FLEXIBLE_ATTENTION: TicketType[] = ['task', 'execute'];

export function nodeState(t: Ticket, byId: Map<string, Ticket>, mode: MapMode = DEFAULT_MAP_MODE): NodeState {
  if (t.state === 'closed') return t.closeReason === 'not_planned' ? 'out-of-scope' : 'decided';
  if (t.status === 'verifying') return 'verifying';
  if (t.status === 'blocked') return 'held';
  if (t.assignee) return 'claimed';
  if (t.status === 'rework') return 'rework';
  if (mode === 'plan-only' && t.type === 'execute') return 'parked';
  const blocked = t.blockedBy.some((b) => byId.get(b)?.state === 'open');
  return blocked ? 'blocked' : 'frontier';
}

export function deriveStates(tickets: Ticket[], mode: MapMode = DEFAULT_MAP_MODE): Map<string, NodeState> {
  const byId = new Map(tickets.map((t) => [t.id, t]));
  return new Map(tickets.map((t) => [t.id, nodeState(t, byId, mode)]));
}

/** Frontier = open, unblocked, unclaimed. Ordered by creation (oldest first). */
export function frontier(tickets: Ticket[], mode: MapMode = DEFAULT_MAP_MODE): Ticket[] {
  const s = deriveStates(tickets, mode);
  return tickets.filter((t) => s.get(t.id) === 'frontier').sort((a, b) => a.createdAt - b.createdAt);
}
