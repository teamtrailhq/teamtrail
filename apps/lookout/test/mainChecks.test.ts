import type { MainChecksView, MainChoice, MainRun } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { mainChecksActions } from '../src/features/main-checks/mainChecksActions';
import { mainChecksText } from '../src/features/main-checks/mainChecksText';

const run: MainRun = {
  v: 1,
  id: 'M-1',
  commit: 'abcdef1234567890abcdef1234567890abcdef12',
  branch: 'main',
  startedAt: 0,
  finishedAt: 60_000,
  configHash: 'h',
  by: 'Teamtrail',
  result: 'fail',
  checks: [
    {
      name: 'test',
      argv: ['npm', 'test'],
      passed: false,
      exitCode: 1,
      timedOut: false,
      durationMs: 1,
      tail: 'FAIL App\n× should render title',
    },
  ],
};

const view = (state: MainChecksView['state'], over: Partial<MainChecksView> = {}): MainChecksView => ({
  mapId: 'm',
  state,
  run,
  choices: { known: [], dropped: [] },
  holds: false,
  ...over,
});

function runners() {
  const chosen: MainChoice[] = [];
  let runs = 0;
  return { chosen, runs: () => runs, r: { choose: (c: MainChoice) => chosen.push(c), run: () => void runs++ } };
}

describe('checks on main in the Lookout', () => {
  it('a failure that waits on you is red, says what fails and where, and offers the three ways on', () => {
    const v = view({ kind: 'failed', failing: ['test'], fixing: false }, { holds: true });
    const text = mainChecksText(v, 120_000);
    expect(text.edge).toBe('urgent');
    expect(text.title).toBe('test fails on main');
    expect(text.context).toEqual([
      'Implementation waits for you',
      'main',
      { text: 'abcdef12', code: true },
      expect.any(String),
    ]);
    expect(text.detail).toBe('× should render title');
    const { r, chosen } = runners();
    const a = mainChecksActions(v, r);
    expect(a.buttons.map((b) => b.label)).toEqual(['Fix main first', 'Drop test for this trail', 'Start anyway']);
    a.buttons.forEach((b) => b.onSelect());
    expect(chosen).toEqual([{ kind: 'fix-main' }, { kind: 'drop', check: 'test' }, { kind: 'proceed' }]);
  });

  it('every choice has its way back', () => {
    const fixing = mainChecksActions(view({ kind: 'failed', failing: ['test'], fixing: true }), runners().r);
    expect(fixing.buttons.map((b) => b.label)).toEqual(['Run again']);
    expect(fixing.menu.map((b) => b.label)).toEqual(['Choose again']);
    const choices = {
      known: [],
      dropped: [{ name: 'lint', at: 1, by: 'trail lead', runId: 'M-1' }],
      proceed: { at: 1, by: 'trail lead', runId: 'M-1' },
    };
    const accepted = view({ kind: 'accepted', known: ['test'], dropped: ['lint'] }, { choices });
    expect(mainChecksText(accepted, 0).title).toBe('Known failures on main: test · Dropped for this trail: lint');
    expect(mainChecksActions(accepted, runners().r).menu.map((b) => b.label)).toEqual([
      'Run checks on main again',
      'Restore lint for this trail',
      'Unmark known failures',
    ]);
  });

  it('a run in progress can be skipped, and the skip taken back', () => {
    const { r, chosen } = runners();
    const waiting = mainChecksActions(view({ kind: 'running', proceeding: false }, { holds: true }), r);
    waiting.buttons[0].onSelect();
    expect(chosen).toEqual([{ kind: 'proceed' }]);
    expect(mainChecksActions(view({ kind: 'running', proceeding: true }), r).menu[0].label).toBe('Wait for them');
  });

  it("a failure this machine caused isn't main's: amber, says why, holds nothing, offers a re-run", () => {
    const reason =
      "Checks couldn't run on main here: test (ng isn't installed here). That's this machine, not main's code.";
    const v = view({ kind: 'environment', checks: ['test'], reason });
    const text = mainChecksText(v, 120_000);
    expect(text.edge).toBe('attention');
    expect(text.title).toBe("Checks on main couldn't run on this machine");
    expect(text.context[0]).toBe('Not a failure of main: nothing waits for it');
    expect(text.detail).toBe(reason);
    const { r, runs } = runners();
    const a = mainChecksActions(v, r);
    expect(a.buttons.map((b) => b.label)).toEqual(['Run again']);
    a.buttons[0].onSelect();
    expect(runs()).toBe(1);
  });
});
