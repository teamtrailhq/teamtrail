import { describe, expect, it } from 'vitest';
import { escapeRule } from '../src/attention/escapeRule';
import { isDismissable } from '../src/attention/isDismissable';
import { escapeSource } from '../src/attention/sources/escapeSource';
import type { AttentionInput } from '../src/attention/types';
import type { EscapeTicket, RevertCommit } from '../src/model/escape';
import type { TicketPhase, TransitionEntry } from '../src/model/lifecycle';
import type { CheckResult, VerificationAttempt } from '../src/model/verification';
import { findEscapes } from '../src/scorecard/findEscapes';

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const check = (name: string, exitCode: number): CheckResult => ({
  name,
  argv: ['npm', 'test'],
  cwd: '.',
  exitCode,
  timedOut: false,
  durationMs: 1,
  log: 'x.log',
  tail: '',
  truncated: false,
});

function attempt(id: string, at: number, patch: Partial<VerificationAttempt> = {}): VerificationAttempt {
  return {
    v: 1,
    id,
    mapId: 'm',
    ticketId: '7',
    ticketKey: '#7',
    agent: 'claude-01',
    sessionId: 's1',
    level: 'checks',
    configHash: 'h',
    submittedAt: at,
    finishedAt: at + 5,
    resolution: 'done',
    checks: [check('test', 0), check('lint', 0)],
    result: 'pass',
    git: {
      v: 1,
      base: { head: BASE, branch: 'main' },
      tree: { toplevel: '/r', head: HEAD, branch: 'teamtrail/m/7', fingerprint: 'f' },
      changed: [
        { path: 'src/auth/login.ts', add: 3, del: 1 },
        { path: 'README.md', add: 1, del: 0 },
      ],
      stats: { files: 2, add: 4, del: 1 },
      flags: [],
    },
    ...patch,
  };
}

const move = (event: TransitionEntry['event'], from: TicketPhase, to: TicketPhase, at: number): TransitionEntry => ({
  v: 1,
  kind: 'transition',
  at,
  mapId: 'm',
  ticketId: '7',
  ticketKey: '#7',
  event,
  from,
  to,
  actor: event === 'reopen' ? 'trail lead' : 'teamtrail',
  actorKind: event === 'reopen' ? 'trail lead' : 'engine',
  ...(event === 'reopen' ? { reason: 'login broke' } : {}),
});

const done = move('checks.pass', 'verifying', 'done', 120);
const ticket = (attempts: VerificationAttempt[], pr?: number): EscapeTicket => ({
  mapId: 'm',
  ticketId: '7',
  ticketKey: '#7',
  attempts,
  ...(pr ? { pr } : {}),
});
const revert = (patch: Partial<RevertCommit>): RevertCommit => ({
  sha: 'c'.repeat(40),
  at: 500,
  reverts: 'd'.repeat(40),
  revertedParents: [],
  ...patch,
});

describe('findEscapes', () => {
  it('finds a verified ticket reopened out of done, with the checks that passed and the files it changed', () => {
    const [e, ...rest] = findEscapes({
      tickets: [ticket([attempt('a1', 100)])],
      transitions: [done, move('reopen', 'done', 'ready', 300)],
      reverts: [],
    });
    expect(rest).toEqual([]);
    expect(e).toMatchObject({
      kind: 'reopened',
      at: 300,
      attemptId: 'a1',
      checks: ['test', 'lint'],
      files: ['src/auth/login.ts', 'README.md'],
      evidence: 'reopened by trail lead: login broke',
    });
  });

  it('never counts work that was not verified: no passing attempt, or never done', () => {
    const failed = attempt('a1', 100, { result: 'fail' });
    expect(
      findEscapes({
        tickets: [ticket([failed])],
        transitions: [done, move('reopen', 'done', 'ready', 300)],
        reverts: [],
      }),
    ).toEqual([]);
    expect(
      findEscapes({ tickets: [ticket([attempt('a1', 100)])], transitions: [], reverts: [revert({ reverts: HEAD })] }),
    ).toEqual([]);
  });

  it('finds a revert of the commit, of the merge that brought it in, or of its squashed pull request', () => {
    const t = ticket([attempt('a1', 100)], 12);
    const own = revert({ reverts: HEAD.slice(0, 12) });
    const merge = revert({ revertedParents: ['e'.repeat(40), HEAD] });
    const squash = revert({ revertedSubject: 'Add login (#12)' });
    const prMerge = revert({ revertedSubject: 'Merge pull request #12 from me/login' });
    for (const r of [own, merge, squash, prMerge])
      expect(findEscapes({ tickets: [t], transitions: [done], reverts: [r] })[0]).toMatchObject({
        kind: 'reverted',
        commit: r.sha,
      });
  });

  it('ignores a merge whose first parent is the work, another pull request, and a head the agent never moved', () => {
    const t = ticket([attempt('a1', 100)], 12);
    const firstParent = revert({ revertedParents: [HEAD, 'e'.repeat(40)] });
    const other = revert({ revertedSubject: 'Other (#13)' });
    expect(findEscapes({ tickets: [t], transitions: [done], reverts: [firstParent, other] })).toEqual([]);
    const unmoved = attempt('a1', 100);
    unmoved.git!.base!.head = HEAD;
    const uncommitted = ticket([unmoved]);
    expect(findEscapes({ tickets: [uncommitted], transitions: [done], reverts: [revert({ reverts: HEAD })] })).toEqual(
      [],
    );
  });

  it('keeps one escape per verified attempt, the first sign of it, and a revert before done is not one', () => {
    const t = ticket([attempt('a1', 100)]);
    const twice = findEscapes({
      tickets: [t],
      transitions: [done, move('reopen', 'done', 'ready', 600)],
      reverts: [revert({ reverts: HEAD, at: 400 })],
    });
    expect(twice.map((e) => e.kind)).toEqual(['reverted']);
    const doneLater = move('checks.pass', 'verifying', 'done', 5000);
    expect(
      findEscapes({ tickets: [t], transitions: [doneLater], reverts: [revert({ reverts: HEAD, at: 2000 })] }),
    ).toEqual([]);
  });
});

describe('escape attention item', () => {
  const [escape] = findEscapes({
    tickets: [ticket([attempt('a1', 100)])],
    transitions: [done],
    reverts: [revert({ reverts: HEAD })],
  });

  it('suggests a rule on the folders the work changed, with the ticket in its reason', () => {
    expect(escapeRule(escape)).toEqual({ when: ['README.md', 'src/auth/**'], why: '#7 was verified, then reverted' });
    expect(escapeRule({ ...escape, files: ['a,b/c.ts', '../x.ts', 'ok/y.ts'] }).when).toEqual(['ok/**']);
  });

  it('asks to add a rule, carries it, and can be dismissed', () => {
    const [c] = escapeSource.collect({ escapes: [escape] } as unknown as AttentionInput);
    expect(c).toMatchObject({
      kind: 'escape',
      ticketId: '7',
      title: '#7 was verified, then reverted: add a rule?',
      rule: { when: ['README.md', 'src/auth/**'] },
    });
    expect(c.notes?.[1]).toBe('passed test, lint');
    expect(isDismissable({ kind: 'escape', urgency: 'soon' })).toBe(true);
  });
});
