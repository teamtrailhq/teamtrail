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
  /** The default branch's head here now, when known: a failing run on another commit is out of date. */
  headNow?: string;
}

export interface MainChecksGate {
  state: MainChecksState;
  holds: boolean;
  reason?: string;
}

const GOES_ON = 'Research, junction and review tickets go on.';
const RUNNING = `Checks on main are running first, so a failure already on main isn't blamed on your work. Implementation tickets wait until they finish or the trail lead starts anyway. ${GOES_ON}`;

const list = (names: string[]) => names.join(', ');

const MOVED = 'Main moved since the failing run: checks on main run again on its new head.';

function failedReason(failing: string[], o: { fixing: boolean; moved: boolean }) {
  const { fixing } = o;
  if (o.moved) return `${MOVED} Implementation tickets wait for that run. ${GOES_ON}`;
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

/** Why checks couldn't run on main for reasons of this machine (setup failed, or what the failing checks hit), and what to do. */
function environmentReason(o: { setupFailed?: string; hit: MainCheckResult[] }) {
  if (o.setupFailed)
    return `Setup failed in the worktree for main: ${o.setupFailed.replace(/^setup failed: /, '')}. Fix the setup steps in verification.json, then run again.`;
  const hit = o.hit.map((c) => `${c.name}: ${c.environment}`).join('; ');
  return `${hit}. Install what's missing on this machine (or add setup steps to verification.json), then run again.`;
}

const environment = (checks: string[], reason: string): MainChecksGate => ({
  state: { kind: 'environment', checks, reason },
  holds: false,
});

function finished(run: MainRun, choices: TrailMainChoices, headNow?: string): MainChecksGate {
  if (run.result === 'pass') return { state: { kind: 'passed' }, holds: false };
  const setupFailed = run.setup?.some((s) => !s.passed) ? run.note : undefined;
  if (setupFailed) return environment([], environmentReason({ setupFailed, hit: [] }));
  if (run.result === 'unavailable')
    return { state: { kind: 'unavailable', reason: run.note ?? 'nothing ran' }, holds: false };
  const failed = run.checks.filter((c) => !c.passed);
  const why = failed.map((c) => ({ check: c, as: explained(c, { run, choices }) }));
  const open = why.filter((w) => !w.as).map((w) => w.check);
  // a failure the machine caused says nothing about main: it never holds
  const failing = open.filter((c) => !c.environment).map((c) => c.name);
  if (!failing.length && open.length)
    return environment(
      open.map((c) => c.name),
      environmentReason({ hit: open }),
    );
  if (!failing.length) {
    const known = why.filter((w) => w.as === 'known').map((w) => w.check.name);
    const dropped = why.filter((w) => w.as === 'dropped').map((w) => w.check.name);
    return { state: { kind: 'accepted', known, dropped }, holds: false };
  }
  const fixing = choices.fixMain?.runId === run.id;
  const moved = !!headNow && !!run.commit && headNow !== run.commit;
  const state = { kind: 'failed' as const, failing, fixing, ...(moved ? { moved: true as const } : {}) };
  return { state, holds: true, reason: failedReason(failing, { fixing, moved }) };
}

/**
 * Where checks on main stand for a trail, and whether its implementation claims wait: while the first run is due or
 * running (unless the trail lead started anyway), and while main fails in a way nobody chose to live with. Never
 * longer: a run that can't happen, or checks that are off, hold nothing. Pure.
 */
export function mainChecksState(i: MainChecksStateInput): MainChecksGate {
  if (i.plan.kind === 'off') return { state: { kind: 'off', reason: i.plan.reason }, holds: false };
  const run = i.run && i.run.configHash === i.plan.hash ? i.run : undefined;
  const gate = gateOf(run, i.choices, i.headNow);
  return i.ready ? gate : { state: gate.state, holds: false };
}

function gateOf(run: MainRun | undefined, choices: TrailMainChoices, headNow?: string): MainChecksGate {
  if (!run) return { state: { kind: 'not-run' }, holds: true, reason: RUNNING };
  if (run.result !== 'running') return finished(run, choices, headNow);
  const proceeding = choices.proceed?.runId === run.id;
  return { state: { kind: 'running', proceeding }, holds: !proceeding, ...(proceeding ? {} : { reason: RUNNING }) };
}
