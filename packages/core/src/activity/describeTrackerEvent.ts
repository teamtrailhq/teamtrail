import { MAP_LABEL } from '../model/brand';
import { SECTION_LABEL } from '../model/mapBody';
import type { FeedEntry, Ticket, TrackerEvent } from '../model/types';

/** Human line for a tracker event; `lookup` resolves ticket ids to keys/titles. */
export function describeTrackerEvent(
  e: TrackerEvent,
  lookup: (id: string) => Ticket | undefined,
): Omit<FeedEntry, 'id' | 'at'> | null {
  const k = (id: string) => lookup(id)?.key ?? id;
  switch (e.kind) {
    case 'map.created':
      return { source: 'tracker', level: 'ok', text: `Trail created · label ${MAP_LABEL}` };
    case 'map.updated':
      return {
        source: 'tracker',
        level: 'info',
        text: `Trail updated${e.section ? ` · ${SECTION_LABEL[e.section].toLowerCase()}` : ''}`,
      };
    case 'map.mode':
      return { source: 'tracker', level: 'warn', text: `Trail mode · ${e.mode}` };
    case 'ticket.created':
      return { source: 'tracker', level: 'info', ticketId: e.ticketId, text: `Opened ${k(e.ticketId)}` };
    case 'ticket.claimed':
      return {
        source: 'tracker',
        level: 'warn',
        ticketId: e.ticketId,
        text: `Assigned ${k(e.ticketId)} to ${e.assignee}`,
      };
    case 'ticket.released':
      return { source: 'tracker', level: 'info', ticketId: e.ticketId, text: `Unassigned ${k(e.ticketId)}` };
    case 'ticket.closed':
      return {
        source: 'tracker',
        level: e.reason === 'completed' ? 'ok' : 'alert',
        ...(e.reason === 'completed' ? { kind: 'done' as const } : {}),
        ticketId: e.ticketId,
        text: `Closed ${k(e.ticketId)} · ${e.reason === 'completed' ? 'completed' : 'not planned'}`,
      };
    case 'ticket.commented':
      return { source: 'tracker', level: 'info', ticketId: e.ticketId, text: `Comment on ${k(e.ticketId)}` };
    case 'edge.added':
      return {
        source: 'tracker',
        level: 'info',
        ticketId: e.blockedId,
        text: `${k(e.blockerId)} blocks ${k(e.blockedId)}`,
      };
    case 'edge.removed':
      return {
        source: 'tracker',
        level: 'info',
        ticketId: e.blockedId,
        text: `${k(e.blockerId)} no longer blocks ${k(e.blockedId)}`,
      };
    case 'decision.recorded':
      return {
        source: 'tracker',
        level: 'ok',
        ticketId: e.ticketId,
        text: `Decision ${e.decisionId} recorded${e.ticketId ? ` · ${k(e.ticketId)}` : ''}`,
      };
    case 'decision.superseded':
      return { source: 'tracker', level: 'warn', text: `Decision ${e.decisionId} superseded by ${e.supersededBy}` };
    case 'external.changed':
      return { source: 'tracker', level: 'warn', text: 'External change detected · resynced' };
    default:
      return null;
  }
}
