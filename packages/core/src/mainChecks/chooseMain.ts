import { journalFile } from '../history/journalFile';
import type { MainChoice, MainChecksEntry, MainRun, TrailMainChoices } from '../model/mainChecks';
import { OperationError } from '../planning/operations/operationError';
import { failuresOf } from './knownFailures';
import { mainChecksPlan } from './mainChecksPlan';
import { updateMainChoices } from './mainChoicesStore';
import { latestMainRun } from './mainRunStore';

/** The trail lead, as the journal names them for a choice made in the Lookout. */
export const MAIN_CHOOSER = 'trail lead';

function needRun(run: MainRun | undefined, kind: MainChoice['kind']): MainRun {
  if (!run)
    throw new OperationError(
      `There is no run of the checks on main to ${kind === 'fix-main' ? 'wait on' : 'start from'}.`,
    );
  return run;
}

function failedCheck(run: MainRun | undefined, check: string) {
  const failed = run?.checks.some((c) => c.name === check && !c.passed);
  if (!failed) throw new OperationError(`${check} didn't fail on main, so there is nothing to drop it for.`);
}

/** The choices after `choice`, made on `run` by `by` at `at`. */
function applied(
  c: TrailMainChoices,
  o: { choice: MainChoice; run?: MainRun; by: string; at: number },
): TrailMainChoices {
  const { choice, by, at } = o;
  switch (choice.kind) {
    case 'fix-main': {
      const { proceed: _p, ...rest } = c;
      return { ...rest, fixMain: { at, by, runId: needRun(o.run, choice.kind).id } };
    }
    case 'proceed': {
      const run = needRun(o.run, choice.kind);
      const { fixMain: _f, ...rest } = c;
      const fresh = failuresOf(run).filter((f) => !c.known.some((k) => k.runId === f.runId && k.name === f.name));
      return { ...rest, proceed: { at, by, runId: run.id }, known: [...c.known, ...fresh] };
    }
    case 'drop':
      failedCheck(o.run, choice.check);
      return {
        ...c,
        dropped: [
          ...c.dropped.filter((d) => d.name !== choice.check),
          { name: choice.check, at, by, runId: o.run!.id },
        ],
      };
    case 'undo-fix-main': {
      const { fixMain: _f, ...rest } = c;
      return rest;
    }
    case 'undo-proceed': {
      const { proceed, ...rest } = c;
      return { ...rest, known: proceed ? c.known.filter((k) => k.runId !== proceed.runId) : [] };
    }
    case 'restore':
      return { ...c, dropped: c.dropped.filter((d) => d.name !== choice.check) };
    default: {
      const never: never = choice;
      return never;
    }
  }
}

/**
 * The trail lead's choice about checks on main for one trail (Fix main first, Drop a check for this trail, Start
 * anyway) or its undo, on this machine and journaled. Every choice can be taken back.
 */
export function chooseMain(o: { root: string; mapId: string; choice: MainChoice; by?: string }): TrailMainChoices {
  const plan = mainChecksPlan(o.root);
  const run = latestMainRun(o.root, plan.kind === 'run' ? plan.budgetMs : 0);
  const by = o.by ?? MAIN_CHOOSER;
  const at = Date.now();
  const next = updateMainChoices(o.root, o.mapId, (c) => applied(c, { choice: o.choice, run, by, at }));
  const check = 'check' in o.choice ? { check: o.choice.check } : {};
  const entry: MainChecksEntry = {
    v: 1,
    kind: 'main-checks',
    at,
    mapId: o.mapId,
    action: o.choice.kind,
    ...(run ? { runId: run.id } : {}),
    ...check,
    actor: by,
    actorKind: 'trail lead',
  };
  journalFile(o.root).append(entry);
  return next;
}
