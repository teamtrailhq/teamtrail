import type { ActivityState, LaidOutNode, MapSnapshot, Ticket, TicketSync, TrailDone } from '@teamtrail/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StepTracker } from '../src/features/activity/StepTracker';
import { DestinationMark } from '../src/features/map/DestinationMark';
import { DestinationTrail } from '../src/features/map/DestinationTrail';
import { GraphEdge } from '../src/features/map/GraphEdge';
import { openPullRequests } from '../src/features/trail-done/openPullRequests';
import { proofsSettled } from '../src/features/trail-done/proofsSettled';
import { TrailDoneDialog } from '../src/features/trail-done/TrailDoneDialog';

// Some modules these pull in read the page's address when they load (vitest hoists this above the imports).
vi.hoisted(() => vi.stubGlobal('location', { search: '' }));

const ticket = (id: string, patch: Partial<Ticket> = {}) =>
  ({ id, key: `#${id}`, title: `T${id}`, state: 'open', blockedBy: [], ...patch }) as unknown as Ticket;
const completed = { state: 'closed', closeReason: 'completed' } as const;
const node = (t: Ticket, x: number) => ({ ticket: t, x, y: 0, state: 'decided' }) as unknown as LaidOutNode;
const passed = { kind: 'passed', commit: 'abc1234def', branch: 'main', runId: 'T-1' } as const;
const verified: TrailDone = {
  kind: 'verified',
  done: 2,
  together: passed,
  reason: 'All 2 tickets verified · verified together on main at abc1234',
};
const unverified: TrailDone = {
  kind: 'unverified',
  done: 2,
  unverified: ['2'],
  together: passed,
  reason: '2 tickets done · 1 not verified · verified together on main at abc1234',
};
const failing: TrailDone = {
  kind: 'unverified',
  done: 2,
  unverified: [],
  together: { kind: 'failed', reason: 'test fails on main at abc1234 after merging', runId: 'T-2' },
  reason: '2 tickets done · test fails on main at abc1234 after merging',
};
const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('the map once tickets are done', () => {
  const edge = (from: Ticket, to: Ticket, extra: Record<string, unknown> = {}) =>
    html(
      createElement(
        'svg',
        null,
        createElement(GraphEdge, { from: node(from, 0), to: node(to, 300), direction: 'LR', cards: [], ...extra }),
      ),
    );

  it('draws a stretch between two done tickets as travelled', () => {
    expect(edge(ticket('1', completed), ticket('2', completed))).toContain('edge-travelled');
  });

  it('keeps the look of stretches ahead: from a done ticket to an open one, or between open ones', () => {
    const walked = edge(ticket('1', completed), ticket('2'));
    expect(walked).toContain('edge-done');
    expect(walked).not.toContain('edge-travelled');
    expect(edge(ticket('1'), ticket('2'))).toContain('edge-open');
  });

  it('keeps a reroute preview’s marks on a travelled stretch', () => {
    expect(edge(ticket('1', completed), ticket('2', completed), { removed: true })).toContain('edge-removed');
  });

  it('walks the last stretches only once the trail is done', () => {
    expect(html(createElement('svg', null, createElement(DestinationTrail, { trails: ['M0 0'] })))).toContain(
      'edge-open',
    );
    const done = html(
      createElement('svg', null, createElement(DestinationTrail, { trails: ['M0 0'], travelled: true })),
    );
    expect(done).toContain('edge-travelled');
  });

  it('marks the destination with an X until it is reached, then a flag that says verified or not', () => {
    const ahead = html(
      createElement(DestinationMark, {
        x: 0,
        y: 0,
        text: 'Ship it',
        done: { kind: 'not-done', reason: '1 ticket still open' },
      }),
    );
    expect(ahead).toContain('x-stroke');
    expect(ahead).not.toContain('flag-cloth');
    const reached = html(createElement(DestinationMark, { x: 0, y: 0, text: 'Ship it', done: verified }));
    expect(reached).toContain('destination reached verified');
    expect(reached).toContain('Destination reached · All 2 tickets verified · verified together on main at abc1234');
    const honest = html(createElement(DestinationMark, { x: 0, y: 0, done: unverified }));
    expect(honest).toContain('destination reached unverified');
    expect(honest).toContain('1 not verified');
    const red = html(createElement(DestinationMark, { x: 0, y: 0, done: failing, onSelect: () => {} }));
    expect(red).toContain('destination reached unverified failing');
    expect(red).toContain('role="button"');
  });
});

describe('the step panel once the trail is done', () => {
  const activity = { sessions: [], feed: [] } as unknown as ActivityState;
  it('shows the outcome in place of the last step', () => {
    const out = html(createElement(StepTracker, { activity, done: verified }));
    expect(out).toContain('Destination reached');
    expect(out).toContain('verified together on main at abc1234');
  });
  it('shows the usual state while the trail isn’t done', () => {
    const out = html(
      createElement(StepTracker, { activity, done: { kind: 'not-done', reason: '1 ticket still open' } }),
    );
    expect(out).not.toContain('Destination reached');
  });
});

describe('the destination reached dialog', () => {
  const dialog = (pulls: number) =>
    html(
      createElement(TrailDoneDialog, {
        done: verified,
        pulls,
        onReview: () => {},
        onChecks: () => {},
        onClose: () => {},
      }),
    );
  it('leads to what fails when the checks fail on main together', () => {
    const out = html(
      createElement(TrailDoneDialog, {
        done: failing,
        pulls: 0,
        onReview: () => {},
        onChecks: () => {},
        onClose: () => {},
      }),
    );
    expect(out).toContain('test fails on main at abc1234 after merging.');
    expect(out).toContain('See what fails');
  });
  it('leads to the open pull requests when there are some', () => {
    const out = dialog(2);
    expect(out).toContain('2 pull requests to merge.');
    expect(out).toContain('Review pull requests');
    expect(out).toContain('Later');
    expect(dialog(1)).toContain('Review pull request<');
  });
  it('only closes when nothing is left', () => {
    const out = dialog(0);
    expect(out).toContain('All 2 tickets verified · verified together on main at abc1234.');
    expect(out).toContain('Close');
    expect(out).not.toContain('pull request');
  });
});

describe('what the trail is judged on', () => {
  it('waits until every done ticket’s proof has loaded', () => {
    const tickets = [
      ticket('1', completed),
      ticket('2', completed),
      ticket('3', { state: 'closed', closeReason: 'not_planned' }),
    ];
    expect(proofsSettled(tickets, { '1': 'verified' })).toBe(false);
    expect(proofsSettled(tickets, { '1': 'verified', '2': 'not-verified' })).toBe(true);
  });

  it('finds the done tickets whose pull request is still open', () => {
    const snap = {
      map: { id: 'm' },
      tickets: [ticket('1', completed), ticket('2', completed), ticket('3')],
    } as unknown as MapSnapshot;
    const sync = (id: string, kind: string) =>
      ({ mapId: 'm', ticketId: id, flags: [{ kind, severity: 'warn', text: '', since: 1 }] }) as unknown as TicketSync;
    const tickets = {
      'm/1': sync('1', 'done-pr-open'),
      'm/2': sync('2', 'checks-unknown'),
      'm/3': sync('3', 'done-pr-open'),
    };
    expect(openPullRequests({ reached: true, live: true, tickets }, snap)).toEqual(['1']);
  });
});
