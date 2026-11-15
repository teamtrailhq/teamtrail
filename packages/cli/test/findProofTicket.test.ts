import type { MapSnapshot } from '@teamtrail/core';
import { describe, expect, it } from 'vitest';
import { findProofTicket } from '../src/proof/findProofTicket';

const snap = (id: string, title: string, keys: string[]) =>
  ({
    map: { id, key: `#${id}`, title },
    tickets: keys.map((k) => ({ id: k, key: `#${k}`, title: k })),
  }) as unknown as MapSnapshot;

const snaps = [snap('m1', 'Checkout', ['1', '2']), snap('m2', 'Search', ['2', '3'])];

describe('findProofTicket', () => {
  it('finds a ticket by key in whichever trail has it', () => {
    const r = findProofTicket({ snaps, ticket: '#3' });
    expect('ticket' in r && `${r.snap.map.title} ${r.ticket.key}`).toBe('Search #3');
  });

  it('asks for --trail when the key is in more than one, and takes it by title', () => {
    expect(findProofTicket({ snaps, ticket: '2' })).toEqual({
      error: '2 is in more than one trail (Checkout; Search): pass --trail.',
    });
    const r = findProofTicket({ snaps, ticket: '2', trail: 'checkout' });
    expect('snap' in r && r.snap.map.id).toBe('m1');
  });

  it('says what is unknown', () => {
    expect(findProofTicket({ snaps, ticket: '9' })).toEqual({ error: 'No ticket 9.' });
    expect(findProofTicket({ snaps, ticket: '1', trail: 'Nope' })).toMatchObject({ error: /Unknown trail "Nope"/ });
    expect(findProofTicket({ snaps: [], ticket: '1' })).toMatchObject({ error: /No trails/ });
  });
});
