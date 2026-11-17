import type { KnownFailure } from '../model/mainChecks';
import type { AttemptKnownFailure, CheckResult } from '../model/verification';
import { checkPassed } from '../verification/runCheck';
import type { ChecksOutcome } from '../verification/runChecks';
import { sameSignature, signatureOf } from './failureSignature';
import { knownFailuresOf } from './knownFailures';
import { outputOf } from './mainCheckResult';
import { readMainChoices } from './mainChoicesStore';
import { latestMainRun } from './mainRunStore';

/** The trail's known failures on main, as the trail lead accepted them on this machine. */
export const trailKnownFailures = (root: string, mapId: string): KnownFailure[] =>
  knownFailuresOf(readMainChoices(root, mapId), latestMainRun(root));

/** The checks the trail lead dropped for this trail because they fail on main. */
export const droppedChecks = (root: string, mapId: string): string[] =>
  readMainChoices(root, mapId).dropped.map((d) => d.name);

/** The known failure `c` repeats: the same check, exit code and failure lines as on main. */
function knownAs(c: CheckResult, o: { root: string; known: KnownFailure[]; folders: string[] }) {
  if (checkPassed(c) || c.timedOut || c.error) return undefined;
  const signature = signatureOf(outputOf(o.root, c), o.folders);
  return o.known.find((k) => k.name === c.name && k.exitCode === c.exitCode && sameSignature(k.signature, signature));
}

const short = (sha: string | null) => (sha ? sha.slice(0, 8) : 'main');

/**
 * A failed attempt whose every failing check fails exactly as it already did on main (a known failure the trail lead
 * accepted for this trail), and that ran every check asked: it isn't the agent's doing, so it isn't sent back. It
 * passes with those failures named on it, and its proof says they are known failures, not verified.
 */
export function withKnownFailures(
  outcome: ChecksOutcome,
  o: { root: string; known: KnownFailure[]; asked: number; folders: string[] },
): ChecksOutcome & { knownFailures?: AttemptKnownFailure[] } {
  if (outcome.result !== 'fail' || !o.known.length || outcome.checks.length < o.asked) return outcome;
  const failed = outcome.checks.filter((c) => !checkPassed(c));
  if (!failed.length) return outcome;
  const matched = failed.map((c) => ({ c, k: knownAs(c, o) }));
  if (matched.some((m) => !m.k)) return outcome;
  const knownFailures = matched.map(({ c, k }) => ({ name: c.name, runId: k!.runId, commit: k!.commit }));
  const names = knownFailures.map((k) => k.name).join(', ');
  const note = `${names} failed as it already does on main (${short(knownFailures[0].commit)}): a known failure the trail lead accepted, not blamed on this work.`;
  return { checks: outcome.checks, result: 'pass', note, knownFailures };
}
