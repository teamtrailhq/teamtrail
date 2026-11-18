import type { TicketMerge, TrailChecksState, TrailRun } from '../model/trailChecks';

export interface TrailChecksStateInput {
  plan: { kind: 'off'; reason: string } | { kind: 'run'; hash: string };
  /** Whether every ticket in scope is closed, and why not. */
  done: { done: boolean; reason: string };
  /** Each done ticket's work; `contained` against the default branch now (unset when a runner checks it). */
  merges: TicketMerge[];
  /** The key a run for these merges has (trailRunKey). */
  key: string;
  /** The latest run for the trail. */
  run?: TrailRun;
  /** The embedding server's runner checks the merges itself, on the commit it runs. */
  runner: boolean;
}

const label = (m: TicketMerge) => (m.pr !== undefined ? `PR #${m.pr}` : m.key);
const list = (ms: TicketMerge[]) => ms.map(label).join(', ');

/** What still keeps the merges from being checked together, in words; empty when nothing does. */
function waitingFor(merges: TicketMerge[], runner: boolean): string[] {
  const of = (s: TicketMerge['state']) => merges.filter((m) => m.state === s);
  const closed = of('closed');
  const unknown = of('unknown');
  const open = of('open');
  const absent = runner ? [] : of('merged').filter((m) => m.contained === false);
  const verb = (n: number) => (n === 1 ? 'is' : 'are');
  return [
    ...(closed.length ? [`${list(closed)} closed without merging`] : []),
    ...(unknown.length ? [`no commit or pull request recorded for ${list(unknown)}`] : []),
    ...(open.length ? [`waiting for ${list(open)} to merge`] : []),
    ...(absent.length ? [`${list(absent)} ${verb(absent.length)} not in main on this machine yet: pull main`] : []),
  ];
}

/** The latest run's verdict, when it ran for these merges with the approved checks and held all of them. */
function fromRun(run: TrailRun): TrailChecksState | undefined {
  if (run.result === 'running') return { kind: 'running' };
  if (run.result === 'unavailable') return { kind: 'unavailable', reason: run.note ?? 'The checks could not run.' };
  if (!run.complete) return undefined;
  if (run.result === 'fail') return { kind: 'failed', failing: run.checks.filter((c) => !c.passed).map((c) => c.name) };
  return { kind: 'passed' };
}

/** A run for these merges whose commit didn't hold them all (a runner on an older head): only Run again helps. */
function incomplete(run: TrailRun): TrailChecksState {
  const missing = run.merges.filter((m) => m.state === 'merged' && !m.contained);
  return { kind: 'unavailable', reason: `The commit it ran on didn't hold ${list(missing) || 'every merge'}.` };
}

/**
 * Where the combined run stands for a trail (pure). Off without approved checks; waiting until every ticket is done
 * and its work is on the default branch; then due, running, passed, failed or unavailable by the latest run made for
 * exactly these merges and these checks, holding all of them. A run for other merges (an earlier one, or Run now
 * before everything merged) never counts.
 */
export function trailChecksState(input: TrailChecksStateInput): TrailChecksState {
  const { plan, run } = input;
  if (plan.kind === 'off') return plan;
  if (!input.done.done) return { kind: 'waiting', reason: input.done.reason };
  const mine = run && run.key === input.key && run.configHash === plan.hash ? run : undefined;
  const verdict = mine && fromRun(mine);
  if (verdict) return verdict;
  const reasons = waitingFor(input.merges, input.runner);
  if (reasons.length) return { kind: 'waiting', reason: `${reasons.join('; ')}.` };
  return mine ? incomplete(mine) : { kind: 'due' };
}
