import type { AttentionItem } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { openItem, type AttentionHandlers } from '../src/features/attention/openItem';
import { KIND_LABEL } from '../src/features/attention/attentionLabels';

describe('a delivery item: messages a connector could not deliver', () => {
  it("opens that connector's settings and is labelled", () => {
    const openConnector = vi.fn();
    const h = { openConnector } as unknown as AttentionHandlers;
    openItem({ kind: 'delivery', ref: 'slack', mapId: '' } as AttentionItem, h);
    expect(openConnector).toHaveBeenCalledWith('slack');
    expect(KIND_LABEL.delivery).toBe('Delivery');
  });
});
