import {
  type AuditDecision,
  claim,
  type MapMode,
  type MapSnapshot,
  type ModelMatching,
  promoteToTicket,
  recordDecision,
  release,
  resolve,
  ruleOutOfScope,
  type ScopeTarget,
  setMapMode,
  setModelMatching,
  supersedeDecision,
  type TicketType,
} from '@teamtrail/core';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { TRAIL_LEAD } from './operator';
import type { Runtime } from './runtime';
import type { Selection } from './selection';

export interface ActionDeps {
  rt: Runtime;
  /** Logs `label`, runs `fn`, and surfaces a rejection as the error toast. */
  guard: (label: string, fn: () => Promise<unknown>) => Promise<void>;
  setMapId: (id: string | undefined) => void;
  mapIdRef: MutableRefObject<string | undefined>;
  snapRef: MutableRefObject<MapSnapshot | undefined>;
  setChatSession: Dispatch<SetStateAction<string | undefined>>;
  setSelection: Dispatch<SetStateAction<Selection>>;
}

/** Trail lead actions of the Lookout, built once per runtime by `useLookout`. */
export function createActions({ rt, guard, setMapId, mapIdRef, snapRef, setChatSession, setSelection }: ActionDeps) {
  const asOperator = { actorKind: 'trail lead' as const, journal: rt.journal };
  return {
    selectMap: (id: string) => setMapId(id),
    openChat: (sessionId: string | undefined) => setChatSession(sessionId),
    // An agent in another process gets it through the bridge, which labels it `lookout` itself (agentRoutes.ts).
    answer: (questionId: string, text: string) => rt.activity.answer(questionId, text, TRAIL_LEAD, { via: 'lookout' }),
    claim: (ticketId: string) =>
      guard('Claim', () => claim(rt.adapter, mapIdRef.current!, ticketId, { ...asOperator, assignee: TRAIL_LEAD })),
    release: (ticketId: string) =>
      guard('Release claim', () =>
        release(rt.adapter, mapIdRef.current!, ticketId, { ...asOperator, actor: TRAIL_LEAD }),
      ),
    /** An agent's claim back to the queue, with a handoff comment of its notes. */
    releaseLease: (ticketId: string) =>
      guard('Release to queue', () => rt.leases.release(mapIdRef.current!, ticketId, TRAIL_LEAD)),
    resolve: (ticketId: string, answer: string, extra: { rationale?: string; alternatives?: string[] } = {}) =>
      guard('Resolve · record answer', async () => {
        const t = snapRef.current?.tickets.find((x) => x.id === ticketId);
        if (t && !t.assignee)
          await claim(rt.adapter, mapIdRef.current!, ticketId, { ...asOperator, assignee: TRAIL_LEAD });
        await resolve(rt.adapter, mapIdRef.current!, ticketId, {
          ...asOperator,
          answer,
          author: TRAIL_LEAD,
          decision: { ...extra, source: { kind: 'lookout', label: 'Ticket inspector' } },
        });
      }),
    /** Replace a decision. Derived (tracker-only) entries are persisted first so the chain has both ends. */
    supersede: (d: AuditDecision, input: { answer: string; rationale?: string; alternatives?: string[] }) =>
      guard(`Supersede ${d.id}`, async () => {
        let id = d.id;
        if (d.derived) {
          const { id: _id, mapId: _m, derived: _d, supersededBy: _s, ...rest } = d;
          id = (await recordDecision(rt.adapter, d.mapId, rest, { appendToTrail: false })).id;
        }
        await supersedeDecision(rt.adapter, d.mapId, id, {
          ...input,
          decidedBy: TRAIL_LEAD,
          participants: [{ id: TRAIL_LEAD }],
          source: { kind: 'lookout', label: 'Logbook' },
        });
      }),
    graduate: ({
      unspecified,
      ...ticket
    }: {
      unspecified: string;
      type: TicketType;
      title: string;
      blockedBy: string[];
      hitl: boolean;
    }) =>
      guard(`Promote to ticket · ${unspecified}`, async () => {
        const t = await promoteToTicket(rt.adapter, mapIdRef.current!, unspecified, ticket);
        setSelection({ kind: 'ticket', id: t.id });
      }),
    ruleOut: (target: ScopeTarget, reason: string) =>
      guard('Rule out of scope', async () => {
        await ruleOutOfScope(rt.adapter, mapIdRef.current!, target, {
          ...asOperator,
          reason,
          author: TRAIL_LEAD,
          source: { kind: 'lookout', label: 'Ticket inspector' },
        });
        setSelection(null);
      }),
    setMode: (mode: MapMode) => guard(`Trail mode · ${mode}`, () => setMapMode(rt.adapter, mapIdRef.current!, mode)),
    /** Model matching on this trail; applies from the next claim. */
    setModelMatching: (value: ModelMatching) =>
      guard(`Model matching · ${value.enabled ? 'on' : 'off'}`, () =>
        setModelMatching(rt.adapter, mapIdRef.current!, value, 'trail lead'),
      ),
  };
}
