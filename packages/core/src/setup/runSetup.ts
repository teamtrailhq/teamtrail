import { setupRefusal } from '../guides/setupArgv';
import type { SetupOutcome, SetupSpec, SetupStepResult } from '../model/setup';
import { checkPassed, runCheck } from '../verification/runCheck';

/** `npm ci in apps/web`: a step as people read it. */
export function setupLabel(s: { argv: string[]; cwd?: string }) {
  const where = s.cwd && s.cwd !== '.' ? ` in ${s.cwd}` : '';
  return `${s.argv.join(' ')}${where}`;
}

/** One line on why a step failed. */
export function setupFailure(r: SetupStepResult): string {
  const step = setupLabel(r);
  if (r.refused) return `${step} wasn't run: ${r.refused}`;
  if (r.timedOut) return `${step} timed out`;
  if (r.error) return `${step} couldn't start: ${r.error}`;
  return `${step} exited ${r.exitCode ?? 'without a code'}`;
}

function refused(name: string, spec: SetupSpec, why: string): SetupStepResult {
  const base = { name, argv: spec.run, cwd: spec.cwd ?? '.', passed: false, exitCode: null, timedOut: false };
  return { ...base, durationMs: 0, refused: why, tail: why };
}

/**
 * Runs the approved setup steps in a worktree Teamtrail prepared (never the person's own checkout), in order, each
 * as a check runs (argv only, the check environment, its whole process tree killed on timeout), its log next to the
 * checks' in `setup/`. A step setupArgv.ts refuses here is not run. Stops at the first step that fails.
 */
export async function runSetup(o: {
  worktree: string;
  setup: Record<string, SetupSpec>;
  /** Absolute folder for the logs, and the same folder relative to the tracker root. */
  logDir: string;
  logRel: string;
  signal?: AbortSignal;
  /** Variable names this machine's person let checks read beyond the allowlist: setup gets the same environment. */
  envNames?: string[];
}): Promise<SetupOutcome> {
  const steps: SetupStepResult[] = [];
  for (const [name, spec] of Object.entries(o.setup)) {
    const why = setupRefusal(spec, o.worktree);
    if (why) {
      steps.push(refused(name, spec, why));
      break;
    }
    const r = await runCheck(name, spec, {
      repoRoot: o.worktree,
      logDir: o.logDir,
      logRel: o.logRel,
      signal: o.signal,
      envNames: o.envNames,
    });
    const passed = checkPassed(r);
    const { signal: _s, truncated: _t, ...kept } = r;
    steps.push({ ...kept, passed });
    if (!passed) break;
  }
  const failed = steps.find((s) => !s.passed);
  return { steps, ...(failed ? { failed: setupFailure(failed) } : {}) };
}

/** True when a config names setup steps. */
export const hasSetup = (setup: Record<string, SetupSpec> | undefined): setup is Record<string, SetupSpec> =>
  !!setup && Object.keys(setup).length > 0;
