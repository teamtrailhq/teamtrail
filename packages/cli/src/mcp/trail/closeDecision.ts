import type { DecisionMeta, DecisionRisk, TranscriptEntry } from '@teamtrail/core';
import { humanDecision, type HumanAnswer } from './humanAnswer';

/** What the decision record of a close needs to know about it. */
export interface ClosingDecision {
  agent: string;
  resolution: string;
  rationale?: string;
  alternatives?: string[];
  assumes?: string[];
  source: { kind: 'agent'; ref: string; label: string };
  risk?: DecisionRisk;
  /** The human's answer this close rests on, when it is their decision. */
  human?: HumanAnswer;
}

/**
 * The audit fields of a close's decision record. It is the human's only when it rests on their answer to a
 * question asked on this ticket: then the record carries the question as asked and their words, and the agent's
 * resolution as its reading of them. Otherwise it is the agent's, whoever spoke in the session.
 */
export function closeDecisionMeta(c: ClosingDecision, log: TranscriptEntry[]): DecisionMeta {
  const theirs = c.human && humanDecision(c.human, { agent: c.agent, said: c.resolution, rationale: c.rationale });
  const people = c.human ? [c.agent, c.human.author] : [c.agent];
  return {
    rationale: c.rationale,
    ...theirs,
    alternatives: c.alternatives,
    decidedBy: theirs?.decidedBy ?? c.agent,
    participants: people.map((id) => ({ id })),
    source: c.source,
    transcript: log.length ? log : (theirs?.transcript ?? []),
    ...(c.risk ? { risk: c.risk } : {}),
    ...(c.assumes?.length ? { assumes: c.assumes } : {}),
  };
}
