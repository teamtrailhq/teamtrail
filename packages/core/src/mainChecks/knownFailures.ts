import type { KnownFailure, MainRun, TrailMainChoices } from '../model/mainChecks';

/** The failed checks of a finished run, as known failures. */
export function failuresOf(run: MainRun): KnownFailure[] {
  if (run.result !== 'fail') return [];
  return run.checks
    .filter((c) => !c.passed)
    .map((c) => ({
      name: c.name,
      runId: run.id,
      commit: run.commit,
      exitCode: c.exitCode,
      signature: c.signature ?? [],
    }));
}

/**
 * A trail's known failures: those the trail lead accepted, and, when they chose to start anyway on the latest run
 * (before it finished too), that run's failures.
 */
export function knownFailuresOf(choices: TrailMainChoices, run?: MainRun): KnownFailure[] {
  const proceeding = !!run && choices.proceed?.runId === run.id;
  const fresh = proceeding
    ? failuresOf(run).filter((f) => !choices.known.some((k) => k.runId === f.runId && k.name === f.name))
    : [];
  return [...choices.known, ...fresh];
}
