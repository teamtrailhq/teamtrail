import { describe, expect, it } from 'vitest';
import { parseTicket, serializeTicket } from '../src/adapters/markdown/ticketFile';
import { ticketFromIssue, ticketLabels } from '../src/adapters/remote/format';
import { HITL_LABEL } from '../src/model/brand';
import type { Ticket } from '../src/model/types';

const ticket = (patch: Partial<Ticket>): Ticket => parseTicket(serializeTicket({ ...base, ...patch }));
const base = parseTicket('---\nid: "4"\ntitle: Ship it\ntype: task\nstate: open\n---\n\nBody\n');

describe('the HITL flag', () => {
  it('survives a round trip through the markdown file for task and execute tickets', () => {
    expect(ticket({ type: 'task', hitl: true }).hitl).toBe(true);
    expect(ticket({ type: 'execute', hitl: true }).hitl).toBe(true);
    expect(ticket({ type: 'execute' }).hitl).toBeUndefined();
  });

  it('is a tracker label for task and execute, and never for types that decide it themselves', () => {
    expect(ticketLabels('execute', true)).toContain(HITL_LABEL);
    expect(ticketLabels('task', true)).toContain(HITL_LABEL);
    expect(ticketLabels('research', true)).not.toContain(HITL_LABEL);
    const issue = {
      id: '4',
      key: '#4',
      title: 'Ship it',
      body: 'Body',
      writer: { kind: 'self', name: 'octo-dev' } as const,
      closed: false,
      blockedBy: [],
      comments: [],
      createdAt: '2026-11-04T00:00:00Z',
      updatedAt: '2026-11-04T00:00:00Z',
    };
    expect(ticketFromIssue({ ...issue, labels: ticketLabels('execute', true) }).hitl).toBe(true);
    expect(ticketFromIssue({ ...issue, labels: ticketLabels('execute') }).hitl).toBeUndefined();
  });
});
