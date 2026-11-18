import { describe, expect, it } from 'vitest';
import { trailDone, type TicketType, type TrailDoneInput, type TrailTogether } from '../src';

/*
 * A trail starts with its discovery research; the implementation tickets are charted once the brief is written and
 * accepted. Until then, the research being done is not the destination.
 */

const passed: TrailTogether = { kind: 'passed', commit: 'abc1234def', branch: 'main', runId: 'T-1' };
const done = (id: string, type?: TicketType) => ({
  id,
  state: 'closed' as const,
  closeReason: 'completed' as const,
  type,
});
const open = (id: string, type: TicketType) => ({ id, state: 'open' as const, type });
const ruledOut = (id: string, type: TicketType) => ({
  id,
  state: 'closed' as const,
  closeReason: 'not_planned' as const,
  type,
});
const judge = (tickets: TrailDoneInput['tickets'], discoverySkipped?: boolean) =>
  trailDone({
    tickets,
    proofs: Object.fromEntries(tickets.map((t) => [t.id, 'verified' as const])),
    pendingReroutes: 0,
    together: passed,
    ...(discoverySkipped === undefined ? {} : { discoverySkipped }),
  });
const NOT_CHARTED = { kind: 'not-done', reason: "The plan isn't charted yet" };

describe('trailDone while the trail is in discovery', () => {
  it('is not done when only the discovery research is, whatever the brief says', () => {
    expect(judge([done('1', 'research')], false)).toEqual(NOT_CHARTED);
    expect(judge([done('1', 'research')]), 'leaving it out counts as not skipped').toEqual(NOT_CHARTED);
  });

  it('counts junction and review tickets as discovery, and ruled-out work as no plan', () => {
    expect(judge([done('1', 'research'), done('2', 'junction'), done('3', 'review')])).toEqual(NOT_CHARTED);
    expect(judge([done('1', 'research'), ruledOut('2', 'task')])).toEqual(NOT_CHARTED);
  });

  it('says what is still open first', () => {
    expect(judge([done('1', 'research'), open('2', 'research')])).toEqual({
      kind: 'not-done',
      reason: '1 ticket still open',
    });
  });

  it('is done once the charted tickets are done too', () => {
    expect(judge([done('1', 'research'), done('2', 'task')]).kind).toBe('verified');
    expect(judge([done('1', 'research'), done('2', 'execute')], false).kind).toBe('verified');
  });

  it('with discovery skipped, any ticket done in scope counts, as before', () => {
    expect(judge([done('1', 'research')], true).kind).toBe('verified');
    expect(
      trailDone({ tickets: [], proofs: {}, pendingReroutes: 0, together: passed, discoverySkipped: true }),
    ).toEqual({ kind: 'not-done', reason: 'No tickets in scope' });
  });

  it('a ticket without a type counts as the plan’s', () => {
    expect(judge([done('1')]).kind).toBe('verified');
  });
});
