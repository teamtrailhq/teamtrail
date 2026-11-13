import type { TrackerAdapter } from '../../adapters/adapter';
import type { TicketType, DecisionSource } from '../../model/types';
import { transition } from '../lifecycle/transition';
import { assertNotArchived } from './assertNotArchived';
import type { ActorOptions } from './claims';
import { recordDecision } from './decisionOps';
import { assertTypeAllowed } from './mapMode';
import { OperationError } from './operationError';

/** Turn a "Not yet specified" line into a real ticket, optionally blocked by existing tickets. */
export async function promoteToTicket(
  adapter: TrackerAdapter,
  mapId: string,
  entry: string,
  input: { type: TicketType; hitl?: boolean; title?: string; body?: string; blockedBy?: string[] },
) {
  const snap = await adapter.loadMap(mapId);
  assertNotArchived(snap.map);
  if (!snap.map.sections.unspecified.includes(entry))
    throw new OperationError(`"${entry}" is not in Not yet specified`);
  assertTypeAllowed(snap.map.mode, input.type);
  const t = await adapter.createTicket(mapId, {
    title: input.title ?? entry,
    type: input.type,
    hitl: input.hitl,
    body: `${input.body ?? `Promoted from Not yet specified: ${entry}`}\n\nPart of trail ${snap.map.key}.`,
  });
  for (const b of input.blockedBy ?? []) await adapter.addBlocking(mapId, b, t.id);
  const fresh = await adapter.loadMap(mapId);
  await adapter.updateMapSections(mapId, { unspecified: fresh.map.sections.unspecified.filter((f) => f !== entry) });
  return t;
}

export type ScopeTarget = { unspecified: string } | { ticketId: string };

/** Rule an unspecified line or an open ticket out of scope. */
export async function ruleOutOfScope(
  adapter: TrackerAdapter,
  mapId: string,
  target: ScopeTarget,
  input: { reason: string; author: string; source?: DecisionSource } & Omit<ActorOptions, 'reason'>,
) {
  const snap = await adapter.loadMap(mapId);
  const { unspecified, outOfScope } = snap.map.sections;
  if ('unspecified' in target) {
    if (!unspecified.includes(target.unspecified))
      throw new OperationError(`"${target.unspecified}" is not in Not yet specified`);
    await adapter.updateMapSections(mapId, {
      unspecified: unspecified.filter((f) => f !== target.unspecified),
      outOfScope: [...outOfScope, `${target.unspecified} — ${input.reason}`],
    });
    return;
  }
  const t = snap.tickets.find((x) => x.id === target.ticketId);
  if (!t) throw new OperationError(`ticket ${target.ticketId} not found`);
  await adapter.comment(mapId, t.id, input.author, `**Ruled out of scope**\n\n${input.reason}`);
  await transition(adapter, mapId, t.id, {
    event: 'cancel',
    actor: input.author,
    actorKind: input.actorKind ?? 'agent',
    reason: input.reason,
    sessionId: input.sessionId,
    journal: input.journal,
  });
  await recordDecision(
    adapter,
    mapId,
    {
      ticketId: t.id,
      ticketKey: t.key,
      question: t.title,
      answer: `Out of scope: ${input.reason}`,
      decidedBy: input.author,
      source: input.source ?? { kind: 'agent', label: input.author },
    },
    { appendToTrail: false },
  );
  const fresh = await adapter.loadMap(mapId);
  await adapter.updateMapSections(mapId, {
    outOfScope: [...fresh.map.sections.outOfScope, `${t.key} ${t.title} — ${input.reason}`],
  });
}
