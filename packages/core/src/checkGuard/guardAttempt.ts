import type { AttemptGuard, GuardFinding } from '../model/checkGuard';
import type { CheckSpec, VerificationConfig } from '../model/verification';
import { gateModeFor } from '../verification/gateModeFor';
import { checkGuardFindings } from './checkGuardFindings';
import type { GuardReaders } from './types';

export interface GuardJob {
  /** The approved config: its checks, their `guards`, and the gate's mode. */
  config: VerificationConfig | undefined;
  /** The checks that ran, by name, in order. */
  checks: string[];
  /** The files the work changed, relative to the folder the checks' `cwd` is relative to. */
  changed: string[];
  read: GuardReaders;
  /** Where a check's `cwd` sits under the folder `changed` is relative to (a repo whose tracker is in a subfolder). */
  prefix?: string;
}

/** Each check by name with its spec, its folder moved under `prefix`. */
function specsOf(j: GuardJob): { name: string; spec: CheckSpec }[] {
  const checks = j.config?.checks ?? {};
  return j.checks
    .filter((name) => checks[name])
    .map((name) => {
      const spec = checks[name];
      const cwd = [j.prefix, spec.cwd].filter(Boolean).join('/');
      const guards = spec.guards?.map((g) => [j.prefix, g.replace(/^\.\//, '')].filter(Boolean).join('/'));
      return { name, spec: { ...spec, ...(cwd ? { cwd } : {}), ...(guards ? { guards } : {}) } };
    });
}

/**
 * The check guard on one completion (gate `check-guard`): whether the work changed what its approved checks run or
 * weakened their tests. Off: nothing is read. Otherwise the findings, and the mode they act in (applyGuard.ts).
 */
export async function guardAttempt(j: GuardJob): Promise<AttemptGuard | undefined> {
  const mode = gateModeFor(j.config, 'check-guard');
  if (mode === 'off' || !j.changed.length) return undefined;
  // a guard that can't read the change can't say it changed nothing: that is a finding, never a crash
  const findings = await checkGuardFindings({ checks: specsOf(j), changed: j.changed, read: j.read }).catch(
    (e: unknown): GuardFinding[] => [
      {
        kind: 'unread',
        file: '',
        text: `the check guard couldn't read the change (${String((e as Error)?.message ?? e).slice(0, 200)})`,
      },
    ],
  );
  if (!findings.length) return undefined;
  return { mode, findings };
}
