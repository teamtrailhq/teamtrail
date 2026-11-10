import type { MapSnapshot, Ticket } from '../../model/types';
import { SEED_TICKETS, type SeedTicket } from './seedTickets';

const SEED_CLOSE_REASON: Record<NonNullable<SeedTicket['status']>, Ticket['closeReason']> = {
  decided: 'completed',
  ruled: 'not_planned',
  claimed: undefined,
};

function seedComments(s: SeedTicket, createdAt: number): Ticket['comments'] {
  const id = `c-${s.n}`;
  if (s.resolution)
    return [{ id, author: 'claude-07', body: `**Resolution**\n\n${s.resolution}`, createdAt: createdAt + 1_800_000 }];
  if (s.status === 'ruled') {
    const body = '**Ruled out of scope**\n\nTransport is already TLS; at-rest E2EE is a separate initiative.';
    return [{ id, author: 'arekom', body, createdAt }];
  }
  return [];
}

/** A mid-flight sample map: some decisions made, one ticket claimed, a live frontier and unspecified items. */
export function sampleSnapshot(now = Date.now()): MapSnapshot {
  const id = (n: number) => `t-${n}`;
  const tickets: Ticket[] = SEED_TICKETS.map((s, i) => {
    const createdAt = now - (SEED_TICKETS.length - i) * 3_600_000;
    const comments = seedComments(s, createdAt);
    const closed = s.status === 'decided' || s.status === 'ruled';
    return {
      id: id(s.n),
      key: `#${s.n}`,
      title: s.title,
      type: s.type,
      hitl: s.hitl,
      body: `${s.body}\n\nPart of trail #142.`,
      state: closed ? 'closed' : 'open',
      closeReason: s.status && SEED_CLOSE_REASON[s.status],
      assignee: s.assignee,
      blockedBy: (s.blockedBy ?? []).map(id),
      comments,
      createdAt,
      updatedAt: createdAt,
      closedAt: closed ? createdAt + 1_800_000 : undefined,
    };
  });
  return {
    map: {
      id: 'map-142',
      key: '#142',
      title: 'Offline-first sync for Fieldnote',
      mode: 'plan+execute',
      createdAt: now - 20 * 3_600_000,
      updatedAt: now,
      sections: {
        destination:
          'Fieldnote mobile users can capture and edit notes for a week with no signal, and every edit merges cleanly when they reconnect.',
        notes:
          'Current sync is request/response over REST; ~4% of sessions hit a conflict dialog. Mobile is React Native. Backend is Postgres + a Node API.',
        decisions: SEED_TICKETS.filter((s) => s.resolution).map((s) => ({
          ticketId: id(s.n),
          ticketKey: `#${s.n}`,
          text: s.resolution!.split('. ')[0].replace(/\.$/, '') + '.',
        })),
        unspecified: [
          'Attachments and photo sync',
          'Multi-device presence indicators',
          'Server-side merge for legacy API clients',
          'Quota enforcement when a device exceeds budget',
          'Audit log of merged edits',
          'Desktop app parity',
        ],
        outOfScope: [
          '#155 End-to-end encryption of sync payloads — separate initiative',
          'Real-time collaborative cursors — single-author notes',
          'Web client offline support — mobile first',
        ],
      },
    },
    tickets,
  };
}
