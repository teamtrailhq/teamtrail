import type { Escape, EscapeKind, EscapeTicket, RevertCommit } from '../model/escape';
import type { TransitionEntry } from '../model/lifecycle';
import type { CheckResult, VerificationAttempt } from '../model/verification';

interface CameBack {
  kind: EscapeKind;
  at: number;
  evidence: string;
  commit?: string;
}

const passed = (c: CheckResult) => c.exitCode === 0 && !c.timedOut && !c.error;
const filesOf = (a: VerificationAttempt) => a.git?.changed.map((c) => c.path) ?? a.declaredPaths ?? [];
const short = (sha: string) => sha.slice(0, 7);
/** Commit dates are whole seconds: a revert in the same second as the ticket's done counts as after it. */
const SECOND = 999;

/** Two spellings of one commit: equal, or one a prefix (7+ characters) of the other. */
function sameCommit(a: string, b: string) {
  const [x, y] = [a.toLowerCase(), b.toLowerCase()];
  return Math.min(x.length, y.length) >= 7 && (x.startsWith(y) || y.startsWith(x));
}

/** The commit an attempt verified, only when the agent committed its work (a head that moved since the claim). */
function committed(a: VerificationAttempt) {
  const head = a.git?.tree?.head;
  return head && head !== a.git?.base?.head ? head : undefined;
}

/** The pull request a squash merge `Title (#12)` or a merge commit `Merge pull request #12 from …` names. */
function prOfSubject(subject = '') {
  const n = subject.match(/\(#(\d+)\)\s*$/)?.[1] ?? subject.match(/^Merge pull request #(\d+)\b/)?.[1];
  return n ? Number(n) : undefined;
}

/** Whether the revert undoes this attempt's work: its commit, the merge that brought it in, or its pull request's. */
function revertHits(r: RevertCommit, a: VerificationAttempt, pr?: number) {
  const head = committed(a);
  if (head && (sameCommit(head, r.reverts) || r.revertedParents.slice(1).some((p) => sameCommit(head, p)))) return true;
  return pr !== undefined && prOfSubject(r.revertedSubject) === pr;
}

/** Whether the ticket reached done after the attempt was submitted and by `at`: verified, not just passing. */
const doneBetween = (dones: number[], a: VerificationAttempt, at: number) =>
  dones.some((d) => d >= a.submittedAt && d <= at);

function escapeOf(t: EscapeTicket, a: VerificationAttempt, came: CameBack): Escape {
  return {
    mapId: t.mapId,
    ticketId: t.ticketId,
    ticketKey: t.ticketKey,
    ...came,
    attemptId: a.id,
    verifiedAt: a.finishedAt,
    files: filesOf(a),
    checks: a.checks.filter(passed).map((c) => c.name),
    agent: a.agent,
    ...(a.sessionId ? { sessionId: a.sessionId } : {}),
  };
}

function reopened(t: EscapeTicket, moves: TransitionEntry[], dones: number[]): Escape[] {
  return moves
    .filter((m) => m.event === 'reopen' && m.from === 'done')
    .flatMap((m) => {
      const a = [...t.attempts].reverse().find((x) => x.result === 'pass' && doneBetween(dones, x, m.at));
      if (!a) return [];
      const evidence = `reopened by ${m.actor}${m.reason ? `: ${m.reason}` : ''}`;
      return [escapeOf(t, a, { kind: 'reopened', at: m.at, evidence })];
    });
}

function reverted(t: EscapeTicket, reverts: RevertCommit[], dones: number[]): Escape[] {
  return reverts.flatMap((r) => {
    const a = [...t.attempts]
      .reverse()
      .find((x) => x.result === 'pass' && revertHits(r, x, t.pr) && doneBetween(dones, x, r.at + SECOND));
    if (!a) return [];
    const evidence = `reverted on the default branch by ${short(r.sha)} (reverts ${short(r.reverts)})`;
    return [escapeOf(t, a, { kind: 'reverted', at: r.at, evidence, commit: r.sha })];
  });
}

/**
 * Verified work that came back: a ticket closed as done on a passing attempt and later reopened (the journal's
 * `reopen` out of done), or whose commit, merge or squashed pull request a commit on the default branch reverts.
 * One escape per verified attempt, the first sign of it; oldest first. Pure: the same records give the same escapes.
 */
export function findEscapes(input: {
  tickets: EscapeTicket[];
  transitions: TransitionEntry[];
  reverts: RevertCommit[];
}): Escape[] {
  const found = input.tickets.flatMap((t) => {
    const moves = input.transitions.filter((m) => m.mapId === t.mapId && m.ticketId === t.ticketId);
    const dones = moves.filter((m) => m.to === 'done').map((m) => m.at);
    return [...reopened(t, moves, dones), ...reverted(t, input.reverts, dones)];
  });
  const first = new Map<string, Escape>();
  for (const e of found.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind))) {
    const key = `${e.mapId}/${e.ticketId}/${e.attemptId}`;
    if (!first.has(key)) first.set(key, e);
  }
  return [...first.values()];
}
