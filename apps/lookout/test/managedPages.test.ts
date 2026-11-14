import { describe, expect, test } from 'vitest';
import { managedPages } from '../src/lib/managedPages';

const origin = 'https://demo.example.test';

describe('managedPages', () => {
  test('keeps pages on this origin, as paths or full URLs', () => {
    const pages = managedPages(
      [
        { label: 'People', href: '/_people' },
        { label: 'Billing', href: 'https://demo.example.test/billing' },
      ],
      origin,
    );
    expect(pages).toEqual([
      { label: 'People', href: '/_people' },
      { label: 'Billing', href: 'https://demo.example.test/billing' },
    ]);
  });

  test('drops anything that would leave this origin or is malformed', () => {
    const pages = managedPages(
      [
        { label: 'Elsewhere', href: 'https://evil.example.test/' },
        { label: 'Protocol-relative', href: '//evil.example.test/x' },
        { label: 'Script', href: 'javascript:alert(1)' },
        { label: 'Data', href: 'data:text/html,hi' },
        { label: '', href: '/x' },
        { label: 'x'.repeat(41), href: '/x' },
        { label: 'No href' },
        null,
        'People',
      ],
      origin,
    );
    expect(pages).toEqual([]);
  });

  test('a reply without pages, or with too many, stays bounded', () => {
    expect(managedPages(undefined, origin)).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => ({ label: `P${i}`, href: `/p${i}` }));
    expect(managedPages(many, origin)).toHaveLength(8);
  });
});
