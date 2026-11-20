import { waitsOnHuman, type ActivityState, type MapSnapshot } from '@teamtrail/core';

/**
 * The open questions that still wait on the human, as the attention queue counts them (core waitsOnHuman.ts): one
 * answered in an agent's chat stays open but no longer counts, unless a gate or the agent waits for their answer.
 */
export function waitingQuestions(activity: ActivityState, snap: MapSnapshot | undefined) {
  return activity.pending.filter((q) =>
    waitsOnHuman(q, {
      session: activity.sessions.find((s) => s.id === q.sessionId),
      ticket: snap?.map.id === q.mapId ? snap.tickets.find((t) => t.id === q.ticketId) : undefined,
    }),
  );
}
