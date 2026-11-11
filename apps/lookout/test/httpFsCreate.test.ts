import { afterEach, describe, expect, it, vi } from 'vitest';

/*
 * The Lookout's numbered create (a new ticket or decision) is exclusive: it sends If-None-Match: *, and a name an
 * agent took in the meantime answers 412, so createNumbered moves on to the next number instead of overwriting it.
 */
describe('httpFs.create', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends If-None-Match: * and reports a taken name as false', async () => {
    vi.stubGlobal('location', { search: '' });
    const calls: RequestInit[] = [];
    const answers = [412, 200];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(init);
        return new Response('', { status: answers.shift() });
      }),
    );
    const { httpFs } = await import('../src/lib/httpFs');
    expect(await httpFs.create!('t/tickets/7.md', 'x')).toBe(false);
    expect(await httpFs.create!('t/tickets/8.md', 'x')).toBe(true);
    expect(calls.map((c) => [c.method, (c.headers as Record<string, string>)['If-None-Match']])).toEqual([
      ['PUT', '*'],
      ['PUT', '*'],
    ]);
  });
});
