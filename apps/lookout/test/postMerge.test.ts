import { afterEach, describe, expect, test, vi } from 'vitest';
import { postMerge } from '../src/lib/postMerge';

const origin = 'https://demo.example.test';
const at = { path: '/_cloud/merge', mapId: 'm', ticketId: '3' };

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
});
