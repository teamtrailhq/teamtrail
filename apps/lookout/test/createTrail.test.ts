import { MemoryAdapter } from '@teamtrail/core';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createTrail } from '../src/lib/createTrail';

const input = { title: 'Hello', destination: 'It says hello', notes: '' };

/** The server's answers: the verification config, and the brief created after. */
function server(config: unknown) {
  vi.stubGlobal('location', { href: 'http://127.0.0.1/', origin: 'http://127.0.0.1', search: '' });
  vi.stubGlobal('fetch', async (url: string) =>
    String(url).endsWith('/verification/config') ? new Response(JSON.stringify(config)) : new Response('{}'),
  );
}

describe('a trail started in the Lookout', () => {
  afterEach(() => vi.unstubAllGlobals());

  test("starts at the project's default level, as an agent's start_trail does", async () => {
    server({ config: { default: 'checks' }, approval: { state: 'approved' } });
    expect((await createTrail(new MemoryAdapter(), input)).verification).toBe('checks');
  });

  test('not from a config nobody approved here, nor when it says off', async () => {
    server({ config: { default: 'checks' }, approval: { state: 'first' } });
    expect((await createTrail(new MemoryAdapter(), input)).verification).toBeUndefined();
    server({ config: { default: 'off' }, approval: { state: 'approved' } });
    expect((await createTrail(new MemoryAdapter(), input)).verification).toBeUndefined();
  });
});
