import { describe, expect, it } from 'vitest';
import { nextShown } from '../src/lib/nextShown';
import { responseError } from '../src/lib/responseError';

describe('the version the human opened stays the one they approve', () => {
  it('keeps the first hash, flags a different one, and moves on only when they review again', () => {
    const opened = nextShown(undefined, 'a');
    expect(opened).toEqual({ hash: 'a', latest: 'a' });
    expect(nextShown(opened, 'a')).toBe(opened);
    const changed = nextShown(opened, 'b');
    expect(changed).toEqual({ hash: 'a', latest: 'b' });
    expect(nextShown(changed, 'c')).toEqual({ hash: 'a', latest: 'c' });
  });
});

describe('an approval that did not go through says why', () => {
  it('reads the error of a refused request, and nothing for one that went through', async () => {
    const refused = new Response(JSON.stringify({ error: 'These criteria changed since you opened it' }), {
      status: 409,
    });
    expect(await responseError(refused)).toBe('These criteria changed since you opened it');
    expect(await responseError(new Response('not json', { status: 500 }))).toBe('HTTP 500');
    expect(await responseError(new Response('{}', { status: 200 }))).toBeUndefined();
    expect(await responseError(undefined)).toBe('Could not reach the Lookout');
  });
});
