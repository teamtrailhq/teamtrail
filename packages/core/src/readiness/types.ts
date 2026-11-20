import type { CheckFinding, CheckSuggestion } from '../model/checkScreening';
import type { LocalProbes } from '../model/readiness';
import type { RepoProfile } from '../model/repoProfile';
import type { VerificationConfig } from '../model/verification';
import type { ChecksState } from '../verification/checksApproval';

/** Everything readiness is judged from, already read: repoReadiness is pure over it. */
export interface ReadinessInput {
  profile: RepoProfile;
  /** The checks approval on this machine: its state and the hash a fix must name. */
  approval: { state: ChecksState; waiting: boolean; hash: string };
  /** The approved config (what checks actually run), when there is one. */
  config?: VerificationConfig;
  /** Screening of the approved checks (verification/screenChecks.ts). */
  screening: CheckFinding[];
  /** The checks the profile suggests (repoProfile/suggestChecks.ts). */
  suggestions: CheckSuggestion[];
  /** This machine's probes; missing where checks don't run here: nothing about the machine is said then. */
  probes?: LocalProbes;
  now: number;
}

/** An approved check as readiness reads it. */
export interface ApprovedCheck {
  name: string;
  run: string[];
  cwd: string;
}
