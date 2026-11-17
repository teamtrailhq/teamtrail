import type { MainChecksState, MainChecksView, MainRun } from '@teamtrail/core';
import type { EdgeTone, MetaPart } from '../../components/ui';
import { ago } from '../../lib';

/** One row of checks on main: the three levels of the presenting-data rules. */
export interface MainChecksRowText {
  edge: EdgeTone;
  title: string;
  context: MetaPart[];
  detail?: string;
}

const list = (names: string[]) => names.join(', ');
const fails = (names: string[]) => `${list(names)} ${names.length === 1 ? 'fails' : 'fail'} on main`;

/** Where the run ran: the branch and commit, and when it finished (or started). */
function where(run: MainRun | undefined, now: number): MetaPart[] {
  if (!run) return [];
  const at = run.finishedAt ?? run.startedAt;
  return [
    run.branch ?? 'main',
    ...(run.commit ? [{ text: run.commit.slice(0, 8), code: true }] : []),
    ...(run.runner ? [`by ${run.runner}`] : []),
    ago(now - at),
  ];
}

function stateText(state: MainChecksState, holds: boolean): Omit<MainChecksRowText, 'context'> & { why?: string } {
  switch (state.kind) {
    case 'off':
      return { edge: 'neutral', title: 'Checks on main are off', why: state.reason };
    case 'not-run':
      return { edge: 'neutral', title: 'Checks on main run before building starts' };
    case 'running':
      return {
        edge: 'neutral',
        title: 'Running checks on main',
        why: state.proceeding ? 'Agents start without waiting' : 'Implementation waits for them',
      };
    case 'passed':
      return { edge: 'neutral', title: 'Checks pass on main' };
    case 'unavailable':
      return { edge: 'attention', title: "Checks on main couldn't run", detail: state.reason };
    case 'failed':
      return {
        edge: state.fixing ? 'attention' : 'urgent',
        title: fails(state.failing),
        why: failedWhy(state.fixing, holds),
      };
    case 'accepted':
      return { edge: 'attention', title: acceptedTitle(state.known, state.dropped) };
    default: {
      const never: never = state;
      return never;
    }
  }
}

function failedWhy(fixing: boolean, holds: boolean) {
  if (fixing) return 'Waiting for main to be fixed';
  return holds ? 'Implementation waits for you' : undefined;
}

function acceptedTitle(known: string[], dropped: string[]) {
  const parts = [
    known.length ? `Known failures on main: ${list(known)}` : '',
    dropped.length ? `Dropped for this trail: ${list(dropped)}` : '',
  ];
  return parts.filter(Boolean).join(' · ');
}

/** The first lines of the first failing check's output, for the detail line. */
function failingOutput(run: MainRun | undefined) {
  const failed = run?.checks.find((c) => !c.passed);
  const lines = failed?.tail.split('\n').filter((l) => l.trim());
  return lines?.at(-1);
}

/** What the trail's checks on main row says. */
export function mainChecksText(view: MainChecksView, now: number): MainChecksRowText {
  const s = stateText(view.state, view.holds);
  const detail = s.detail ?? (view.state.kind === 'failed' ? failingOutput(view.run) : undefined);
  return {
    edge: s.edge,
    title: s.title,
    context: [...(s.why ? [s.why] : []), ...where(view.run, now)],
    ...(detail ? { detail } : {}),
  };
}
