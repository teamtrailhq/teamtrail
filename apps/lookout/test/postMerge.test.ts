import { afterEach, describe, expect, test, vi } from 'vitest';
import { postMerge } from '../src/lib/postMerge';
import { prSync } from '../src/lib/prSync';

const origin = 'https://demo.example.test';
const at = { path: '/_cloud/merge', mapId: 'm', ticketId: '3' };

/** The ticket's PR snapshot as a server that merges keeps it. */
function snapshot(o: { mapId?: string; ticketId?: string; state: 'open' | 'merged' | 'closed'; number?: number }) {
  const number = o.number ?? 2;
  return {
    v: 1,
    mapId: o.mapId ?? 'm',
    ticketId: o.ticketId ?? '3',
    ticketKey: `#${o.ticketId ?? '3'}`,
    provider: 'Teamtrail Cloud',
    link: { number, source: 'branch', at: 1 },
    pr: {
      number,
      url: `https://github.com/a/b/pull/${number}`,
      title: '',
      state: o.state,
      draft: false,
      headSha: 'a'.repeat(40),
      headRef: 'teamtrail/m/3',
      sameRepo: true,
      review: 'none',
      mergeable: 'clean',
      updatedAt: 1,
    },
    checks: [],
    checksSummary: 'none',
    flags: [],
    syncedAt: 1,
  };
}

const shown = () => prSync.ticket(prSync.get(), 'm', '3')?.pr;

/** Answers each request in turn, keeping what was asked. */
function answers(...replies: { status?: number; body: unknown }[]) {
  const asked: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('location', { href: `${origin}/`, origin, search: '' });
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    asked.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
    const r = replies.shift() ?? { status: 500, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  });
  return asked;
}

describe('merging from the Lookout', () => {
  afterEach(() => vi.unstubAllGlobals());

  test('a verified ticket: one request to the server that merges, nothing recorded first', async () => {
    const asked = answers({ body: { merged: true, url: 'https://github.com/a/b/pull/2' } });
    expect(await postMerge(at)).toEqual({ kind: 'merged', url: 'https://github.com/a/b/pull/2' });
    expect(asked).toEqual([{ url: '/_cloud/merge', body: { trail: 'm', ticket: '3' } }]);
  });

  test("Merge anyway: the trail lead's acceptance first, then the merge names its gaps hash", async () => {
    const asked = answers({ body: { gapsHash: 'sha256:abc' } }, { body: { merged: true } });
    const gaps = ['Known failures, already failing on main: lint.'];
    expect(await postMerge({ ...at, gaps })).toEqual({ kind: 'merged', url: undefined });
    expect(asked[0]).toEqual({ url: '/__teamtrail/proof/merge-anyway', body: { mapId: 'm', ticketId: '3', gaps } });
    expect(asked[1].body).toEqual({ trail: 'm', ticket: '3', anyway: true, gaps: 'sha256:abc' });
  });

  test('Merge anyway at the pull request’s head: the head shown goes with the acceptance and the merge', async () => {
    const asked = answers({ body: { gapsHash: 'sha256:def' } }, { body: { merged: true } });
    const gaps = ['Finished with no checks set: nothing was checked.'];
    const head = 'a'.repeat(40);
    expect(await postMerge({ ...at, gaps, head })).toEqual({ kind: 'merged', url: undefined });
    expect(asked[0].body).toEqual({ mapId: 'm', ticketId: '3', gaps, head });
    expect(asked[1].body).toEqual({ trail: 'm', ticket: '3', anyway: true, gaps: 'sha256:def', head });
  });

  test('a head the pull request moved past is refused with the server’s words, and shown with its new head', async () => {
    const moved = { ...snapshot({ state: 'open' }) };
    moved.pr = { ...moved.pr, headSha: 'b'.repeat(40) };
    const error = 'The pull request has new commits since you looked. Review again.';
    answers({ body: { gapsHash: 'sha256:def' } }, { status: 409, body: { error, sync: moved } });
    const r = await postMerge({ ...at, gaps: ['x'], head: 'a'.repeat(40) });
    expect(r).toEqual({ kind: 'error', text: error });
    expect(shown()).toMatchObject({ state: 'open', headSha: 'b'.repeat(40) });
  });

  test('an acceptance refused stops there: nothing is merged, and the reason is shown', async () => {
    const asked = answers({
      status: 409,
      body: { error: '#3 is high risk: ask someone allowed to make high-risk calls.' },
    });
    expect(await postMerge({ ...at, gaps: ['x'] })).toEqual({
      kind: 'error',
      text: '#3 is high risk: ask someone allowed to make high-risk calls.',
    });
    expect(asked).toHaveLength(1);
  });

  test("the merge's reply carries the ticket's snapshot: the page shows it merged at once", async () => {
    answers({ body: { merged: true, url: 'https://github.com/a/b/pull/2', sync: snapshot({ state: 'merged' }) } });
    expect((await postMerge(at)).kind).toBe('merged');
    expect(shown()).toMatchObject({ number: 2, state: 'merged' });
  });

  test('a refusal for a pull request merged or closed already carries its snapshot too', async () => {
    answers({
      status: 409,
      body: { error: 'Pull request #4 was closed without merging.', sync: snapshot({ state: 'closed', number: 4 }) },
    });
    expect(await postMerge(at)).toEqual({ kind: 'error', text: 'Pull request #4 was closed without merging.' });
    expect(shown()).toMatchObject({ number: 4, state: 'closed' });
  });

  test("a snapshot for another ticket, or not one, isn't shown", async () => {
    answers(
      { body: { merged: true, sync: snapshot({ ticketId: '9', state: 'open', number: 7 }) } },
      { body: { merged: true, sync: { v: 1, mapId: 'm', ticketId: '3', pr: { number: 8, state: 'gone' } } } },
    );
    await postMerge(at);
    await postMerge(at);
    expect(prSync.ticket(prSync.get(), 'm', '9')).toBeUndefined();
    expect(shown()).toMatchObject({ number: 4, state: 'closed' });
  });
});
