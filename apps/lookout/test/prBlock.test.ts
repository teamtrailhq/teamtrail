import type { TicketSync } from '@teamtrail/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { prChip } from '../src/features/map/prChip';
import { PullRequestBlock } from '../src/features/pr-sync';
import { prBlock } from '../src/features/pr-sync/prBlock';

const HEAD = 'a'.repeat(40);

function sync(pr: Partial<NonNullable<TicketSync['pr']>> | null, more: Partial<TicketSync> = {}): TicketSync {
  return {
    v: 1,
    mapId: 'm',
    ticketId: '3',
    ticketKey: '#3',
    provider: 'github',
    link: { number: 12, source: 'attempt', at: 0 },
    ...(pr === null
      ? {}
      : {
          pr: {
            number: 12,
            url: 'https://github.com/acme/app/pull/12',
            title: 'Add the export button',
            state: 'open',
            draft: false,
            headSha: HEAD,
            headRef: 'teamtrail/m/3',
            sameRepo: true,
            review: 'none',
            mergeable: 'clean',
            updatedAt: 0,
            ...pr,
          },
        }),
    checks: [],
    checksSummary: 'passed',
    flags: [],
    syncedAt: Date.now(),
    ...more,
  };
}

const text = (parts: unknown[]) => parts.map((p) => (typeof p === 'string' ? p : (p as { text: string }).text));

describe('prBlock', () => {
  it('says nothing for a ticket without a pull request', () => {
    expect(prBlock(undefined, HEAD)).toBeUndefined();
    expect(renderToStaticMarkup(createElement(PullRequestBlock, { mapId: 'm', ticketId: '3' }))).toBe('');
  });

  it('shows an open PR at the commit its proof covers, with its checks', () => {
    const b = prBlock(sync({}), HEAD)!;
    expect(b).toMatchObject({ number: 12, state: 'open', title: 'Add the export button' });
    expect(text(b.parts).slice(0, 2)).toEqual(['checks passing', 'at the commit its proof covers']);
  });

  it('says a merged PR is merged at the commit its proof covers', () => {
    const b = prBlock(sync({ state: 'merged', mergeCommit: 'f'.repeat(40) }), HEAD)!;
    expect(b.state).toBe('merged');
    expect(text(b.parts)).toContain('merged at the commit its proof covers');
  });

  it('says plainly when the PR was merged at a newer commit than its proof covers', () => {
    const b = prBlock(sync({ state: 'merged', headSha: 'b'.repeat(40) }), HEAD)!;
    expect(b.parts).toContainEqual({ text: 'merged at a newer commit than its proof covers', strong: true });
  });

  it('shows a PR closed unmerged without checks or a proof comparison', () => {
    const b = prBlock(sync({ state: 'closed' }, { checksSummary: 'failing' }), HEAD)!;
    expect(b.state).toBe('closed');
    expect(text(b.parts)).toEqual([expect.stringMatching(/^synced /)]);
  });

  it('shows the linked number before PR sync has read the PR, and a failed sync', () => {
    expect(prBlock(sync(null, { syncedAt: undefined }))).toEqual({
      number: 12,
      state: 'unread',
      parts: ['not synced yet'],
    });
    expect(text(prBlock(sync({}, { error: 'rate limited' }))!.parts)).toContain('sync failed');
  });

  it("says an open PR's review and merge conflicts, and is as fresh as the PR sync's last good tick", () => {
    const b = prBlock(sync({ review: 'changes_requested', mergeable: 'conflicting' }), HEAD)!;
    expect(text(b.parts)).toEqual([
      'checks passing',
      'changes requested',
      'merge conflicts',
      'at the commit its proof covers',
      expect.stringMatching(/^synced /),
    ]);
    expect(text(prBlock(sync({ review: 'approved' }), HEAD)!.parts)).toContain('approved');
    const old = sync({}, { syncedAt: Date.now() - 14 * 60_000 });
    expect(text(prBlock(old, HEAD)!.parts).at(-1)).toBe('synced 14m ago');
    expect(text(prBlock(old, HEAD, Date.now())!.parts).at(-1)).not.toBe('synced 14m ago');
  });

  it('renders the state chip, the title as text and a safe Open pull request link', () => {
    const html = renderToStaticMarkup(
      createElement(PullRequestBlock, {
        mapId: 'm',
        ticketId: '3',
        sync: sync({ state: 'merged', title: '<b>x</b>' }),
        proofHead: HEAD,
      }),
    );
    expect(html).toContain('>Merged<');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('href="https://github.com/acme/app/pull/12" target="_blank" rel="noreferrer noopener"');
    const bad = renderToStaticMarkup(
      createElement(PullRequestBlock, {
        mapId: 'm',
        ticketId: '3',
        sync: sync({ url: 'javascript:alert(1)' }),
        proofHead: HEAD,
      }),
    );
    expect(bad).not.toContain('Open pull request');
  });
});

describe('prChip', () => {
  it('names the PR and its state for a map card, nothing before sync read it', () => {
    expect(prChip(sync({ state: 'merged' }))).toBe('PR #12 merged');
    expect(prChip(sync({ draft: true }))).toBe('PR #12 draft');
    expect(prChip(sync(null))).toBeUndefined();
  });
});
