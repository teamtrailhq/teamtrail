import type { AttemptRule, DiffRule, RuleAnswer } from '../model/diffRule';
import { oneLine } from '../model/safeText';
import { matchRules } from './matchRules';
import { ruleWaivers } from './ruleWaivers';

/** The most of an answer an attempt keeps. */
export const MAX_RULE_ANSWER = 2000;

/** The agent's answer to a rule, trimmed and capped; undefined when it gave none, or only blanks. */
export function answerTo(answers: RuleAnswer[] | undefined, id: string): string | undefined {
  const given = answers?.find((a) => a.rule === id)?.answer.trim();
  return given ? given.slice(0, MAX_RULE_ANSWER) : undefined;
}

/**
 * What the rules make of a completion: each rule the changed files matched, with the agent's answer, the trail lead's
 * waiver or `unanswered`, and the checks the matched rules add to the ticket's (named checks of the approved config,
 * never more than once). `rules` must come from the approved config: nothing an agent writes adds or drops one.
 */
export function ruleOutcomes(o: {
  root: string;
  mapId: string;
  ticketId: string;
  rules: DiffRule[];
  files: string[];
  answers?: RuleAnswer[];
}): { rules: AttemptRule[]; checks: string[] } {
  const matched = matchRules(o.rules, o.files);
  if (!matched.length) return { rules: [], checks: [] };
  const waivers = ruleWaivers.list(o.root, o.mapId, o.ticketId);
  const rules = matched.map(({ rule, files }): AttemptRule => {
    const base = { id: rule.id, why: rule.why, files, ...(rule.check ? { check: rule.check } : {}) };
    if (!rule.ask) return base;
    const answer = answerTo(o.answers, rule.id);
    if (answer) return { ...base, ask: rule.ask, answer };
    const w = waivers.find((x) => x.rule === rule.id);
    if (w) return { ...base, ask: rule.ask, waived: { by: w.by, reason: oneLine(w.reason), at: w.at } };
    return { ...base, ask: rule.ask, unanswered: true };
  });
  const checks = [...new Set(matched.flatMap(({ rule }) => (rule.check ? [rule.check] : [])))];
  return { rules, checks };
}
