import type { MainCheckResult, MainChecksState, MainRun, TrailMainChoices } from '../model/mainChecks';
import { sameSignature } from './failureSignature';
import { knownFailuresOf } from './knownFailures';

export interface MainChecksStateInput {
  /** What a run would run: off with why, or the approved config's hash. */
  plan: { kind: 'off'; reason: string } | { kind: 'run'; hash: string };
  /** Implementation may start on the trail (discovery done or skipped): only then do claims wait for main. */
  ready: boolean;
  /** The latest run on main that is finished or still running. */
  run?: MainRun;
  choices: TrailMainChoices;
}

export interface MainChecksGate {
  state: MainChecksState;
  holds: boolean;
  reason?: string;
}

const GOES_ON = 'Research, junction and review tickets go on.';
const RUNNING = `Checks on main are running first, so a failure already on main isn't blamed on your work. Implementation tickets wait until they finish or the trail lead starts anyway. ${GOES_ON}`;

const list = (names: string[]) => names.join(', ');

function failedReason(failing: string[], fixing: boolean) {
  const what = `Checks already fail on main (${list(failing)})`;
  if (fixing) return `${what} and the trail lead is fixing main first: implementation tickets wait. ${GOES_ON}`;
  return `${what}: implementation tickets wait for the trail lead to fix main, drop the check for this trail or start anyway. ${GOES_ON}`;
}

/** A failed check on main that the trail lead dropped for this trail or accepted as a known failure. */
function explained(c: MainCheckResult, o: { run: MainRun; choices: TrailMainChoices }) {
  if (o.choices.dropped.some((d) => d.name === c.name)) return 'dropped';
  const known = knownFailuresOf(o.choices, o.run).filter((k) => k.name === c.name);
  const same = known.some(
    (k) => k.runId === o.run.id || (k.exitCode === c.exitCode && sameSignature(k.signature, c.signature ?? [])),
  );
  return same ? 'known' : undefined;
}

function finished(run: MainRun, choices: TrailMainChoices): MainChecksGate {
  if (run.result === 'pass') return { state: { kind: 'passed' }, holds: false };
  if (run.result === 'unavailable')
    return { state: { kind: 'unavailable', reason: run.note ?? 'nothing ran' }, holds: false };
  const failed = run.checks.filter((c) => !c.passed);
  const why = failed.map((c) => ({ name: c.name, as: explained(c, { run, choices }) }));
  const failing = why.filter((w) => !w.as).map((w) => w.name);
  if (!failing.length) {
    const known = why.filter((w) => w.as === 'known').map((w) => w.name);
    const dropped = why.filter((w) => w.as === 'dropped').map((w) => w.name);
    return { state: { kind: 'accepted', known, dropped }, holds: false };
  }
  const fixing = choices.fixMain?.runId === run.id;
  return { state: { kind: 'failed', failing, fixing }, holds: true, reason: failedReason(failing, fixing) };
}

/**
 * Where checks on main stand for a trail, and whether its implementation claims wait: while the first run is due or
 * running (unless the trail lead started anyway), and while main fails in a way nobody chose to live with. Never
 * longer: a run that can't happen, or checks that are off, hold nothing. Pure.
 */
export function mainChecksState(i: MainChecksStateInput): MainChecksGate {
  if (i.plan.kind === 'off') return { state: { kind: 'off', reason: i.plan.reason }, holds: false };
  const run = i.run && i.run.configHash === i.plan.hash ? i.run : undefined;
  const gate = gateOf(run, i.choices);
  return i.ready ? gate : { state: gate.state, holds: false };
}

function gateOf(run: MainRun | undefined, choices: TrailMainChoices): MainChecksGate {
  if (!run) return { state: { kind: 'not-run' }, holds: true, reason: RUNNING };
  if (run.result !== 'running') return finished(run, choices);
  const proceeding = choices.proceed?.runId === run.id;
  return { state: { kind: 'running', proceeding }, holds: !proceeding, ...(proceeding ? {} : { reason: RUNNING }) };
}
