import { describe, expect, it } from 'vitest';
import {
  trailChecksState,
  trailMerges,
  trailRunKey,
  trailTogether,
  type PullRequestSnapshot,
  type TicketMerge,
  type TrailRun,
} from '../src';

const done = { done: true, reason: '' };
const plan = { kind: 'run' as const, hash: 'h1' };
const merged = (key: string, commit: string, contained?: boolean): TicketMerge => ({
  ticketId: key.slice(1),
  key,
  state: 'merged',
  commit,
  ...(contained === undefined ? {} : { contained }),
});

function run(o: Partial<TrailRun> & { merges: TicketMerge[] }): TrailRun {
  return {
    v: 1,
    id: 'T-1',
    mapId: 'm',
    commit: 'abcdef1234',
    branch: 'main',
    startedAt: 1,
    finishedAt: 2,
    configHash: 'h1',
    checks: [
      { name: 'test', argv: ['npm', 'test'], passed: true, exitCode: 0, timedOut: false, durationMs: 1, tail: '' },
    ],
    result: 'pass',
    by: 'Teamtrail',
    complete: true,
    key: trailRunKey('h1', o.merges),
    ...o,
  };
}

const pr = (o: Partial<PullRequestSnapshot>): PullRequestSnapshot => ({
  number: 5,
  url: '',
  title: '',
  state: 'merged',
  draft: false,
  headSha: 'aaaaaaa',
  headRef: 'x',
  sameRepo: true,
  review: 'none',
  mergeable: 'clean',
  updatedAt: 1,
  ...o,
});

describe('trailMerges', () => {
  const t = (id: string, type: 'execute' | 'research' = 'execute') => ({
    id,
    key: `#${id}`,
    type,
    state: 'closed' as const,
    closeReason: 'completed' as const,
  });
  const git = (head: string, files = 1) => ({
    git: { v: 1 as const, tree: { head } as never, changed: [], stats: { files, add: 1, del: 0 }, flags: [] },
  });

  it('takes the merge commit of a merged pull request, not its head', () => {
    const out = trailMerges({
      tickets: [t('1')],
      pr: () => pr({ mergeCommit: 'beefcafe12' }),
      attempt: () => undefined,
    });
    expect(out).toEqual([{ ticketId: '1', key: '#1', pr: 5, state: 'merged', commit: 'beefcafe12' }]);
  });

  it('waits on an open pull request and names a closed one', () => {
    const states = trailMerges({
      tickets: [t('1'), t('2')],
      pr: (id) => pr({ number: Number(id), state: id === '1' ? 'open' : 'closed' }),
      attempt: () => undefined,
    }).map((m) => m.state);
    expect(states).toEqual(['open', 'closed']);
  });

  it('without a pull request uses the verified commit, and nothing to merge when no file changed', () => {
    const out = trailMerges({
      tickets: [t('1'), t('2'), t('3', 'research'), t('4')],
      pr: () => undefined,
      attempt: (id) => (id === '1' ? git('abc1234') : id === '2' ? git('abc1234', 0) : undefined),
    });
    expect(out.map((m) => [m.key, m.state, m.commit])).toEqual([
      ['#1', 'merged', 'abc1234'],
      ['#2', 'nothing', undefined],
      ['#3', 'nothing', undefined],
      ['#4', 'unknown', undefined],
    ]);
  });
});

describe('trailChecksState', () => {
  const merges = [merged('#1', 'aaaaaaa', true), merged('#2', 'bbbbbbb', true)];
  const key = trailRunKey('h1', merges);
  const base = { plan, done, merges, key, runner: false };

  it('is off without approved checks, and waits while a ticket is open', () => {
    expect(trailChecksState({ ...base, plan: { kind: 'off', reason: 'No checks.' } })).toEqual({
      kind: 'off',
      reason: 'No checks.',
    });
    const open = { done: false, reason: 'Runs once every ticket is done: 1 still open.' };
    expect(trailChecksState({ ...base, done: open }).kind).toBe('waiting');
  });

  it('waits for open pull requests and for merges this machine has not pulled', () => {
    const waiting = [
      { ...merges[0], state: 'open' as const, pr: 7, commit: undefined },
      merged('#2', 'bbbbbbb', false),
    ];
    expect(trailChecksState({ ...base, merges: waiting, key: trailRunKey('h1', waiting) })).toEqual({
      kind: 'waiting',
      reason: 'waiting for PR #7 to merge; #2 is not in main on this machine yet: pull main.',
    });
  });

  it('is due when everything is merged and no run was made for these merges', () => {
    expect(trailChecksState(base)).toEqual({ kind: 'due' });
    const other = run({ merges: [merged('#1', 'aaaaaaa', true)] });
    expect(trailChecksState({ ...base, run: other })).toEqual({ kind: 'due' });
  });

  it('passes or fails by the run made for exactly these merges and checks', () => {
    expect(trailChecksState({ ...base, run: run({ merges }) })).toEqual({ kind: 'passed' });
    const failed = run({ merges, result: 'fail', checks: [{ ...run({ merges }).checks[0], passed: false }] });
    expect(trailChecksState({ ...base, run: failed })).toEqual({ kind: 'failed', failing: ['test'] });
    expect(trailChecksState({ ...base, run: run({ merges, configHash: 'h0' }) })).toEqual({ kind: 'due' });
  });

  it("never passes on a run whose commit didn't hold every merge", () => {
    const partial = run({ merges: [merges[0], { ...merges[1], contained: false }], complete: false });
    expect(trailChecksState({ ...base, run: { ...partial, key } })).toEqual({
      kind: 'unavailable',
      reason: "The commit it ran on didn't hold #2.",
    });
  });
});

describe('trailTogether', () => {
  it('passes with the commit, and fails with what failed and where', () => {
    const merges = [merged('#1', 'aaaaaaa', true)];
    expect(trailTogether({ kind: 'passed' }, run({ merges }))).toEqual({
      kind: 'passed',
      commit: 'abcdef1234',
      branch: 'main',
      runId: 'T-1',
    });
    expect(trailTogether({ kind: 'failed', failing: ['lint', 'test'] }, run({ merges }))).toEqual({
      kind: 'failed',
      reason: 'lint, test fail on main at abcdef1 after merging',
      runId: 'T-1',
    });
    expect(trailTogether({ kind: 'due' })).toEqual({ kind: 'pending', reason: 'checks run on main next' });
  });
});
