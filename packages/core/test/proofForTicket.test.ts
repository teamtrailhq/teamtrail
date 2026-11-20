import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { DecisionRecord, MapSnapshot, Ticket } from '../src/model/types';
import type { VerificationAttempt } from '../src/model/verification';
import { proofForTicket } from '../src/node';
import { writeAttempt, writeVerdict } from '../src/verification/evidenceStore';

const made: string[] = [];
const temp = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'teamtrail-proof-'));
  made.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

const ticket = { id: '6', key: '#6', title: 'Free shipping', type: 'execute', blockedBy: ['3'] } as Ticket;
const snap = { map: { id: 'm1', title: 'Checkout' }, tickets: [ticket] } as unknown as MapSnapshot;

const attempt = (id: string, result: VerificationAttempt['result']) =>
  ({
    v: 1,
    id,
    mapId: 'm1',
    ticketId: '6',
    ticketKey: '#6',
    agent: 'claude-01',
    sessionId: 's1',
    origin: 'local:1',
    level: 'checks',
    configHash: 'h',
    submittedAt: 1,
    finishedAt: 2,
    resolution: 'done',
    checks: [],
    result,
  }) as VerificationAttempt;

const decision = (id: string, ticketId?: string) =>
  ({ id, mapId: 'm1', ticketId, summary: id, decidedBy: 'trail lead', decidedAt: 1 }) as DecisionRecord;

describe('proofForTicket', () => {
  it("reads the ticket's recorded attempts and verdicts, and the decisions it relies on", () => {
    const root = temp();
    writeAttempt(root, attempt('A-1', 'fail'));
    writeAttempt(root, attempt('A-2', 'pass'));
    writeVerdict(root, {
      v: 1,
      mapId: 'm1',
      ticketId: '6',
      attemptId: 'A-2',
      by: 'trail lead',
      byKind: 'trail lead',
      verdict: 'PASS',
      summary: 'ok',
      findings: [],
      at: 3,
    });
    const p = proofForTicket({
      root,
      snap,
      ticket,
      decisions: [decision('D-1', '6'), decision('D-2', '3'), decision('D-3', '9'), decision('D-4')],
    });
    expect(p.status).toBe('verified');
    expect(p.trail).toBe('Checkout');
    expect(p.attempt.id).toBe('A-2');
    expect(p.earlier).toEqual([{ id: 'A-1', result: 'fail' }]);
    expect(p.reviews).toHaveLength(1);
    expect(p.decisions.map((d) => d.id)).toEqual(['D-1', 'D-2']);
  });

  it('says plainly when nothing was submitted', () => {
    const root = temp();
    const p = proofForTicket({ root, snap, ticket, decisions: [] });
    expect(p.status).toBe('not-verified');
    expect(p.gaps).toEqual(['No completion was submitted for this ticket.']);
  });

  it('says a done implementation ticket with nothing recorded finished with nothing checked', () => {
    const root = temp();
    const done = { ...ticket, state: 'closed', closeReason: 'completed' } as Ticket;
    const p = proofForTicket({ root, snap: { ...snap, tickets: [done] }, ticket: done, decisions: [] });
    expect(p.gaps).toEqual(['Finished with no checks set: nothing was checked.']);
    // a research ticket closed by a decision has no work to prove: its line stays as it was, and so does its digest
    const research = { ...done, type: 'research' } as Ticket;
    const r = proofForTicket({ root, snap: { ...snap, tickets: [research] }, ticket: research, decisions: [] });
    expect(r.gaps).toEqual(['No completion was submitted for this ticket.']);
    const before = proofForTicket({ root, snap: { ...snap, tickets: [research] }, ticket: research, decisions: [] });
    expect(r.digest).toBe(before.digest);
  });
});
