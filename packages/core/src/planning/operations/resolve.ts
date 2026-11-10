import type { TrackerAdapter } from '../../adapters/adapter';
import type { DecisionRisk } from '../../model/risk';
import type { Participant, DecisionSource, TranscriptEntry } from '../../model/types';
import { firstSentence } from '../decisions/decisionRecord';
import { transition } from '../lifecycle/transition';
import type { ActorOptions } from './claims';
import { recordDecision } from './decisionOps';
import { OperationError } from './operationError';

/** Audit fields a caller can attach when resolving; everything defaults from the ticket and author. */
export interface DecisionMeta {
  question?: string;
  /**
   * The record's answer and summary when they are not the resolution: a human's decision keeps their own words
   * (the resolution is still posted as the author's comment).
   */
  answer?: string;
  summary?: string;
  alternatives?: string[];
  rationale?: string;
  /** Actor id of who made the call; defaults to the resolving author. */
  decidedBy?: string;
  participants?: Participant[];
  source?: DecisionSource;
  /** Kept on the record even when only a summary is posted to the ticket. */
  transcript?: TranscriptEntry[];
  /** The policy level of the call (see riskLevelFor). */
  risk?: DecisionRisk;
  /** Trail assumptions (`S-<n>`) the decision relies on. */
  assumes?: string[];
}

/** How the ticket gets to done: `complete` without verification, else the verdict that passed it. */
/** What the resolution says; `ResolveOptions` add who fires the event and where it is journaled. */
export interface ResolveInput {
  answer: string;
  author: string;
  summary?: string;
  transcript?: string;
  decision?: DecisionMeta;
  trailLine?: string;
}

export interface ResolveOptions extends ActorOptions {
  event?: 'complete' | 'checks.pass' | 'review.pass' | 'approve' | 'accept';
  /** Who fires the event, when not the author (the engine, the trail lead). */
  actor?: string;
}

/** Resolve: resolution comment, close, decision record + line in the map's "Decisions so far". */
export async function resolve(
  adapter: TrackerAdapter,
  mapId: string,
  ticketId: string,
  input: ResolveInput & ResolveOptions,
) {
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  if (t.state === 'closed') throw new OperationError(`${t.key} is already closed`);
  if (input.transcript)
    await adapter.comment(mapId, ticketId, input.author, `**HITL transcript**\n\n${input.transcript}`);
  await adapter.comment(mapId, ticketId, input.author, `**Resolution**\n\n${input.answer}`);
  await transition(adapter, mapId, ticketId, {
    event: input.event ?? 'complete',
    actor: input.actor ?? input.author,
    actorKind: input.actorKind ?? 'agent',
    sessionId: input.sessionId,
    reason: input.reason,
    journal: input.journal,
    ...(input.event && input.event !== 'complete' ? { to: 'done' as const } : {}),
  });
  const d = input.decision ?? {};
  await recordDecision(
    adapter,
    mapId,
    {
      ticketId: t.id,
      ticketKey: t.key,
      question: d.question ?? t.title,
      answer: d.answer ?? input.answer,
      summary: d.summary ?? input.summary ?? firstSentence(input.answer),
      alternatives: d.alternatives,
      rationale: d.rationale,
      decidedBy: d.decidedBy ?? input.author,
      participants: d.participants,
      source: d.source ?? { kind: 'agent', label: input.author },
      transcript: d.transcript,
      ...(d.risk ? { risk: d.risk } : {}),
      ...(d.assumes?.length ? { assumes: d.assumes } : {}),
    },
    { trailLine: input.trailLine },
  );
  return t;
}
