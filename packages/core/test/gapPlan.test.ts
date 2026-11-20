import { describe, expect, it } from 'vitest';
import type { TicketPhase } from '../src/model/lifecycle';
import type { ProofReview } from '../src/model/proof';
import type { ProofGapKind } from '../src/model/proofGap';
import type { VerificationAttempt } from '../src/model/verification';
import { gapPlan, type GapContext } from '../src/proof/gapPlan';
import { proofGapItems } from '../src/proof/proofGapItems';
import { proofGaps } from '../src/proof/proofGaps';
import { outcomeOf } from '../src/verification/outcome';

const attempt = (over: Partial<VerificationAttempt> = {}): VerificationAttempt => ({
  v: 1,
  id: 'A-1',
  mapId: 'm',
  ticketId: '1',
  ticketKey: '#1',
  agent: 'claude-01',
  level: 'checks',
  configHash: 'h',
  submittedAt: 1,
  finishedAt: 2,
  resolution: 'Done',
  checks: [],
  result: 'pass',
  ...over,
});

const criteria = (over: Partial<NonNullable<VerificationAttempt['criteria']>>) => ({
  lines: [],
  missing: [],
  failed: [],
  manual: [],
  evidence: [],
  confirmed: true,
  ...over,
});

const kinds = (a?: VerificationAttempt, reviews: ProofReview[] = []) =>
  proofGapItems({ attempt: a, reviews }).map((g) => g.kind);
const one = (kind: ProofGapKind, c: Partial<GapContext> & { phase: TicketPhase }) => {
  const [g] = gapPlan([{ kind, text: kind }], { criteriaConfirmed: false, ...c });
  return [g.owner, g.action];
};

describe('proof gaps by kind', () => {
  it('every gap carries its kind, and the lines read as they always did', () => {
    const a = attempt({
      result: 'fail',
      level: 'checks+review+human',
      knownFailures: [{ name: 'lint', reason: 'r' } as never],
      criteria: criteria({ missing: ['AC-1'], failed: ['AC-2'], confirmed: false }),
      rules: [{ id: 'R-1', why: 'w', files: [], ask: 'Why?', unanswered: true }] as never,
    });
    expect(kinds(a)).toEqual([
      'checks-failed',
      'known-failures',
      'criteria-missing-evidence',
      'criteria-failed',
      'criteria-unconfirmed',
      'rule-unanswered',
      'no-independent-review',
      'trail-lead-not-approved',
    ]);
    expect(proofGaps({ attempt: a, reviews: [] })).toContain("The trail lead hadn't confirmed the criteria.");
    expect(kinds(undefined)).toEqual(['no-completion']);
    expect(kinds(attempt({ level: 'off' }))).toEqual(['verification-off']);
    expect(kinds(attempt({ remote: true }))).toEqual(['remote-unchecked']);
  });
});

describe('who closes each gap', () => {
  it('agents close what failed: rework while they can, the human once they could not', () => {
    for (const kind of ['checks-failed', 'criteria-missing-evidence', 'criteria-failed'] as const) {
      expect(one(kind, { phase: 'rework' })).toEqual(['agent', undefined]);
      expect(one(kind, { phase: 'blocked' })).toEqual(['you', 'rework']);
    }
  });

  it('a missing review is an agent’s, opened for it, on another model when the gate holds a same-model pass', () => {
    expect(one('no-independent-review', { phase: 'verifying', review: { open: true } })).toEqual(['agent', undefined]);
    const [g] = gapPlan([{ kind: 'no-independent-review', text: '' }], {
      phase: 'verifying',
      criteriaConfirmed: true,
      review: { open: true, otherModel: true },
    });
    expect(g.status).toMatch(/another model/);
  });

  it('criteria are the human’s: confirm on open work, confirm and verify again on done work', () => {
    expect(one('criteria-unconfirmed', { phase: 'verifying' })).toEqual(['you', 'confirm-criteria']);
    expect(one('criteria-unconfirmed', { phase: 'done' })).toEqual(['you', 'confirm-and-verify']);
    expect(one('criteria-unconfirmed', { phase: 'done', criteriaConfirmed: true })).toEqual(['you', 'verify-again']);
    expect(one('criteria-unconfirmed', { phase: 'verifying', criteriaConfirmed: true })).toEqual(['agent', undefined]);
  });

  it('approvals and held passes are the human’s; main’s failures wait for main', () => {
    expect(one('trail-lead-not-approved', { phase: 'verifying' })).toEqual(['you', 'approve']);
    expect(one('retried', { phase: 'blocked' })).toEqual(['you', 'accept-pass']);
    expect(one('check-guard', { phase: 'blocked' })).toEqual(['you', 'accept-pass']);
    expect(one('known-failures', { phase: 'done' })).toEqual(['main', 'open-main-checks']);
    expect(one('waived-check', { phase: 'done' })).toEqual(['accepted', 'undo-waiver']);
  });

  it('done work the human accepted as it is says so; nothing rewrites a past attempt', () => {
    expect(one('checks-failed', { phase: 'done', acceptedBy: 'trail lead' })).toEqual(['accepted', undefined]);
    expect(one('checks-failed', { phase: 'done' })).toEqual(['nobody', undefined]);
    expect(one('verification-off', { phase: 'done' })).toEqual(['nobody', undefined]);
  });
});

describe('done means verified', () => {
  it('a pass against criteria nobody confirmed waits for the human instead of closing', () => {
    const waits = outcomeOf(attempt({ criteria: criteria({ confirmed: false }) }), 0, 3);
    expect(waits.to).toBe('verifying');
    expect(waits.reason).toMatch(/criteria wait for your confirmation/);
    expect(outcomeOf(attempt({ criteria: criteria({}) }), 0, 3).to).toBe('done');
  });
});

describe('finished with nothing checked', () => {
  it('tells a done ticket that closed with no checks set from one nobody completed, and a remote one with no runner', () => {
    const finished = proofGapItems({ attempt: undefined, reviews: [], finished: true });
    expect(finished).toEqual([
      { kind: 'finished-unchecked', text: 'Finished with no checks set: nothing was checked.' },
    ]);
    expect(kinds(undefined)).toEqual(['no-completion']);
    expect(proofGaps({ attempt: undefined, reviews: [] })).toEqual(['No completion was submitted for this ticket.']);
    // reopened: its finish no longer counts, so it reads as before
    expect(
      proofGapItems({ attempt: undefined, reviews: [], finished: true, reopened: true }).map((g) => g.kind),
    ).toEqual(['reopened', 'no-completion']);
    // a recorded attempt keeps its own gaps, whatever the ticket's state
    const remote = proofGapItems({ attempt: attempt({ remote: true }), reviews: [], finished: true });
    expect(remote.map((g) => g.kind)).toEqual(['remote-unchecked']);
  });

  it('with no checks set, setting them is yours; with checks set, verification was off for it', () => {
    expect(one('finished-unchecked', { phase: 'done' })).toEqual(['you', 'set-checks']);
    expect(one('finished-unchecked', { phase: 'done', checksSet: true })).toEqual(['nobody', undefined]);
    expect(one('finished-unchecked', { phase: 'done', acceptedBy: 'Ada' })).toEqual(['accepted', undefined]);
    const [g] = gapPlan([{ kind: 'finished-unchecked', text: 't' }], { phase: 'done', criteriaConfirmed: false });
    expect(g.status).toMatch(/^Needs you: set the checks/);
  });
});
