import { journalFile } from '../history/journalFile';
import type { GateMode, GateName } from '../model/gateMode';
import type { ActorKind } from '../model/lifecycle';

/**
 * Journals a gate that held work back or would have. Call it only when the gate fired: `off` records nothing.
 * Returns whether the work is held (`enforce`).
 */
export function recordGate(o: {
  root: string;
  mapId: string;
  gate: GateName;
  mode: GateMode;
  reason: string;
  ticket?: { id: string; key: string };
  actor?: string;
  actorKind?: ActorKind;
  now?: number;
}): boolean {
  if (o.mode === 'off') return false;
  journalFile(o.root).append({
    v: 1,
    kind: 'gate',
    at: o.now ?? Date.now(),
    mapId: o.mapId,
    gate: o.gate,
    mode: o.mode,
    ...(o.ticket ? { ticketId: o.ticket.id, ticketKey: o.ticket.key } : {}),
    reason: o.reason,
    actor: o.actor ?? 'teamtrail',
    actorKind: o.actorKind ?? 'engine',
  });
  return o.mode === 'enforce';
}
