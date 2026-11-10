import type { Ticket } from '../../../model/types';
import { ticketFromIssue } from '../format';
import { labelNames, type RestIssue } from './schema';

/** The ticket for an issue this adapter just created, from the REST answer: its body is this machine's own. */
export function createdTicket(i: RestIssue): Ticket {
  return ticketFromIssue({
    id: String(i.number),
    key: `#${i.number}`,
    title: i.title,
    labels: labelNames(i.labels),
    body: i.body,
    writer: { kind: 'self', name: '' },
    closed: false,
    blockedBy: [],
    comments: [],
    createdAt: i.created_at,
    updatedAt: i.updated_at,
  });
}
