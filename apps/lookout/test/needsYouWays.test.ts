import type { AttentionItem, AttentionKind } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { openItem, type AttentionHandlers } from '../src/features/attention/openItem';
import { placeLabel } from '../src/features/hands-off/placeLabel';
import { askedFirst } from '../src/features/inspector/askedFirst';
import { needAction } from '../src/features/inspector/needAction';

const item = (kind: AttentionKind, o: Partial<AttentionItem> = {}) =>
  ({ id: `${kind}:m:x`, kind, mapId: 'm', ref: 'x', title: kind, ...o }) as AttentionItem;

describe('every way a row of Needs you offers leads somewhere', () => {
  it("opens a ticket's row on the item the row is about, not another item on the same ticket", () => {
    const policy = item('policy', { id: 'policy:m:23', ticketId: '23' });
    const merge = item('merge', { id: 'merge:m:23/merge', ticketId: '23' });
    const integration = item('integration', { id: 'integration:m:5+24', ticketId: '23' });
    expect(askedFirst([policy, merge, integration], merge.id).map((i) => i.kind)).toEqual([
      'merge',
      'policy',
      'integration',
    ]);
    expect(askedFirst([policy, merge], undefined)).toEqual([policy, merge]);
    expect(askedFirst([policy, merge], 'gone')).toEqual([policy, merge]);
  });

  it('offers no Open that only selects the trail already on screen', () => {
    const trail = item('tracker-settings', { ref: 'm:p3q1' });
    expect(placeLabel(trail, 'm')).toBeUndefined();
    expect(placeLabel(item('tracker-settings', { mapId: '', ref: 'record' }), 'm')).toBeUndefined();
    expect(placeLabel(trail, 'other')).toBe('Open its trail');
    expect(placeLabel(item('trust'), 'm')).toBe('Open Approvals');
    expect(placeLabel(item('approval', { mapId: 'other', ticketId: '7' }), 'm')).toBeUndefined();
  });

  it('a suggested reroute has no proposal to review: Carry on sets it aside, opening it opens its ticket', () => {
    expect(needAction('reroute-suggested')?.act).toEqual({ kind: 'dismiss', label: 'Carry on' });
    const openReroute = vi.fn();
    const openTicket = vi.fn();
    const h = { openReroute, openTicket } as unknown as AttentionHandlers;
    openItem(item('reroute-suggested', { ticketId: '9', ref: 'S-2' }), h);
    expect(openReroute).not.toHaveBeenCalled();
    expect(openTicket).toHaveBeenCalledWith('m', '9');
    openItem(item('reroute', { ref: 'R-1' }), h);
    expect(openReroute).toHaveBeenCalledTimes(1);
  });
});
