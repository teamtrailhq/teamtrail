import type { AttentionItem } from '@teamtrail/core';
import { describe, expect, it, vi } from 'vitest';
import { KIND_LABEL } from '../src/features/attention/attentionLabels';
import { openItem, type AttentionHandlers } from '../src/features/attention/openItem';
import { rulePrefillHref } from '../src/features/settings/rulePrefillHref';

const rule = { when: ['src/auth/**', 'README.md'], why: '#7 was verified, then reverted' };

describe('an escape item: verified work that came back', () => {
  it('opens the suggested rule, else the ticket', () => {
    const openRule = vi.fn();
    const openTicket = vi.fn();
    const h = { openRule, openTicket } as unknown as AttentionHandlers;
    openItem({ kind: 'escape', mapId: 'm', ticketId: '7', ref: '7:A-1', rule } as AttentionItem, h);
    expect(openRule).toHaveBeenCalledWith(rule);
    openItem({ kind: 'escape', mapId: 'm', ticketId: '7', ref: '7:A-1' } as AttentionItem, h);
    expect(openTicket).toHaveBeenCalledWith('m', '7');
    expect(KIND_LABEL.escape).toBe('Came back');
  });

  it('puts the rule in the address, keeping the rest: when as comma-separated globs, and why', () => {
    const href = rulePrefillHref('http://127.0.0.1:7000/?project=p1&settings=rules', rule);
    const params = new URL(href).searchParams;
    expect(params.get('settings')).toBe('rules');
    expect(params.get('project')).toBe('p1');
    expect(params.get('when')).toBe('src/auth/**,README.md');
    expect(params.get('why')).toBe('#7 was verified, then reverted');
  });
});
