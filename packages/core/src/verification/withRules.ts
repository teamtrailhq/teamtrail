import type { AttemptRule, RuleAnswer } from '../model/diffRule';
import type { VerificationConfig } from '../model/verification';
import type { LevelInfo } from './policy';
import { ruleOutcomes } from './ruleOutcomes';

/**
 * A completion's level with the checks its matched diff rules add, and the rules for its attempt. The checks come from
 * the approved config (`config`), after the ticket's own; a check the trail lead waived for the ticket stays out.
 */
export function withRules(o: {
  root: string;
  config: VerificationConfig | undefined;
  job: {
    mapId: string;
    ticket: { id: string };
    info: LevelInfo;
    sub: { ruleAnswers?: RuleAnswer[] };
    waived?: string[];
  };
  files: string[];
}): { info: LevelInfo; extra: { rules?: AttemptRule[] } } {
  const { job } = o;
  const out = ruleOutcomes({
    root: o.root,
    mapId: job.mapId,
    ticketId: job.ticket.id,
    rules: o.config?.rules ?? [],
    files: o.files,
    answers: job.sub.ruleAnswers,
  });
  if (!out.rules.length) return { info: job.info, extra: {} };
  const skipped = job.waived ?? [];
  const added = out.checks.filter((c) => !job.info.checks.includes(c) && !skipped.includes(c));
  return { info: { ...job.info, checks: [...job.info.checks, ...added] }, extra: { rules: out.rules } };
}
