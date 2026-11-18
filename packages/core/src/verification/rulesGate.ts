import type { HeldRules, RuleAnswer } from '../model/diffRule';
import type { VerificationConfig } from '../model/verification';
import { gateModeFor } from './gateModeFor';
import { heldRulesStore } from './heldRulesStore';
import { recordGate } from './recordGate';
import { ruleOutcomes } from './ruleOutcomes';

export type UnansweredRule = HeldRules['rules'][number];

/**
 * The `diff-rules` gate, before a completion is accepted: the rules whose files the change touched that ask a
 * question, left unanswered and not waived by the trail lead for the ticket. Under `enforce` the completion is held
 * (`held`): the agent answers and completes again, or the trail lead waives the rule in the Lookout; under `observe`
 * it goes through. Either way the gate is journaled. `config` is the approved config, `files` what changed.
 */
export function rulesGate(o: {
  root: string;
  mapId: string;
  ticket: { id: string; key: string };
  config: VerificationConfig | undefined;
  files: string[];
  answers?: RuleAnswer[];
  agent: string;
}): { held: boolean; unanswered: UnansweredRule[] } {
  const { root, mapId, ticket } = o;
  const mode = gateModeFor(o.config, 'diff-rules');
  const outcomes = ruleOutcomes({
    root,
    mapId,
    ticketId: ticket.id,
    rules: o.config?.rules ?? [],
    files: o.files,
    answers: o.answers,
  });
  const unanswered = outcomes.rules
    .filter((r) => r.unanswered)
    .map((r) => ({ id: r.id, ask: r.ask ?? '', why: r.why, files: r.files }));
  if (mode === 'off' || !unanswered.length) {
    heldRulesStore.clear(root, mapId, ticket.id);
    return { held: false, unanswered: [] };
  }
  const reason = `${o.agent} left ${unanswered.map((r) => r.id).join(', ')} unanswered on ${ticket.key}`;
  const held = recordGate({ root, mapId, gate: 'diff-rules', mode, reason, ticket });
  if (held) heldRulesStore.write(root, mapId, ticket.id, { v: 1, at: Date.now(), agent: o.agent, rules: unanswered });
  else heldRulesStore.clear(root, mapId, ticket.id);
  return { held, unanswered };
}
