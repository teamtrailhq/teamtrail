import type { VerificationConfig } from '../model/verification';
import type { ApprovedCheck } from './types';

/** The approved checks every completion runs (`run`, in order), each with its folder ('' for the top). */
export function approvedChecks(config: VerificationConfig | undefined): ApprovedCheck[] {
  if (!config) return [];
  return config.run
    .filter((name) => Object.hasOwn(config.checks, name))
    .map((name) => ({ name, run: config.checks[name].run, cwd: config.checks[name].cwd ?? '' }));
}
