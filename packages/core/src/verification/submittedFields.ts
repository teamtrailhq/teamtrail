import type { AttemptGuide } from '../model/guide';
import type { VerificationAttempt } from '../model/verification';

/** The parts of a submission an attempt keeps only when they were given. */
interface Given {
  summary?: string;
  rationale?: string;
  alternatives?: string[];
  noCodeReason?: string;
  pr?: number;
  remote?: boolean;
  declaredPaths?: string[];
  touches?: string[];
  guides?: AttemptGuide[];
  supersedes?: string;
}

/** What an attempt records of a submission besides its required fields; `runner` names a remote one's check runner. */
export function submittedFields(sub: Given, runner?: string): Partial<VerificationAttempt> {
  return {
    ...(sub.summary ? { summary: sub.summary } : {}),
    ...(sub.rationale ? { rationale: sub.rationale } : {}),
    ...(sub.alternatives?.length ? { alternatives: sub.alternatives } : {}),
    ...(sub.noCodeReason ? { noCodeReason: sub.noCodeReason } : {}),
    ...(sub.pr ? { pr: sub.pr } : {}),
    ...(sub.remote ? { remote: true } : {}),
    ...(sub.remote && runner ? { runner } : {}),
    ...(sub.declaredPaths ? { declaredPaths: sub.declaredPaths } : {}),
    ...(sub.touches?.length ? { touches: sub.touches } : {}),
    ...(sub.guides?.length ? { guides: sub.guides } : {}),
    ...(sub.supersedes ? { supersedes: sub.supersedes } : {}),
  };
}
