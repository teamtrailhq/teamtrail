import type { AttentionItem } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { KIND_LABEL } from '../src/features/attention/attentionLabels';
import { needLabel } from '../src/features/attention/needLabel';
import { openItem, type AttentionHandlers } from '../src/features/attention/openItem';
import { needText } from '../src/features/hands-off/needText';
import { needAction } from '../src/features/inspector/needAction';

vi.hoisted(() => vi.stubGlobal('location', { search: '' }));

const item = {
  kind: 'tracker-refused',
  id: 'tracker-refused:7:w-abc',
  ref: 'w-abc',
  mapId: '7',
  ticketId: '12',
  title: 'GitHub refused a write: close #12',
  reasons: ['GitHub said: Not Found'],
} as AttentionItem;

describe('a write the tracker refused for good', () => {
  it('opens its ticket, where Retry and Discard are acted on in place', () => {
    const openTicket = vi.fn();
    openItem(item, { openTicket } as unknown as AttentionHandlers);
    expect(openTicket).toHaveBeenCalledWith('7', '12');
    expect(needAction('tracker-refused')?.act).toEqual({ kind: 'inline' });
  });

  it('says what it is on the queue, the trail bar and Needs you', () => {
    expect(KIND_LABEL['tracker-refused']).toBe('Not sent');
    expect(needLabel(item, () => '#12')).toBe('#12 Not sent');
    expect(needText(item)).toEqual({ chip: 'Not sent', title: item.title, quick: 'Settle' });
  });
});
