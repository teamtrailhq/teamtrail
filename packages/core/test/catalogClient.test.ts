import { expect, test } from 'vitest';
import { fetchCatalog, MAX_INDEX_BYTES } from '../src/guides/catalogClient';

const registry = { name: 'test', url: 'https://catalog.example' };
const index = JSON.stringify({ v: 1, guides: [] });

/** A fetch that answers `body` (a string, or a stream of chunks) with these headers. */
function serving(body: string | (() => AsyncGenerator<Uint8Array>), headers: Record<string, string> = {}) {
  return (async () => {
    const stream =
      typeof body === 'string'
        ? body
        : new ReadableStream<Uint8Array>({
            async start(c) {
              for await (const chunk of body()) c.enqueue(chunk);
              c.close();
            },
          });
    return new Response(stream, { status: 200, headers });
  }) as unknown as typeof fetch;
}

// The catalog URL comes from guides.json, which agents can write. Its server could answer anything.
test('a catalog answer is capped in size, typed, and bounded in time', async () => {
  const ok = await fetchCatalog(registry, { fetch: serving(index, { 'content-type': 'application/json' }) });
  expect(ok.guides).toEqual([]);
  await expect(
    fetchCatalog(registry, { fetch: serving(index, { 'content-type': 'text/plain; charset=utf-8' }) }),
  ).resolves.toBeTruthy();
  await expect(fetchCatalog(registry, { fetch: serving(index) })).resolves.toBeTruthy();

  await expect(
    fetchCatalog(registry, { fetch: serving('<html>sign in</html>', { 'content-type': 'text/html' }) }),
  ).rejects.toThrow(/answered with text\/html, not a catalog file/);

  // Content-Length that admits it, and one that lies: both stop at the cap.
  const big = 'x'.repeat(MAX_INDEX_BYTES + 1);
  await expect(
    fetchCatalog(registry, { fetch: serving(big, { 'content-length': String(big.length) }) }),
  ).rejects.toThrow(/more than 1048576 bytes/);
  let sent = 0;
  const endless = async function* () {
    for (;;) {
      sent += 65_536;
      yield new Uint8Array(65_536);
    }
  };
  await expect(fetchCatalog(registry, { fetch: serving(endless) })).rejects.toThrow(/more than 1048576 bytes/);
  expect(sent).toBeLessThan(MAX_INDEX_BYTES * 2);

  // A server that answers and then trickles: the deadline covers the body too.
  const trickle = async function* () {
    yield new TextEncoder().encode('{"v":1,');
    await new Promise((r) => setTimeout(r, 2_000));
    yield new TextEncoder().encode('"guides":[]}');
  };
  // As fetch does: an aborted signal errors the body stream.
  const withSignal = (async (url: string, init: RequestInit) => {
    const reader = (await serving(trickle)(url, init)).body!.getReader();
    const aborted = new Promise<never>((_, reject) =>
      init.signal!.addEventListener('abort', () => reject(new Error('The operation was aborted'))),
    );
    aborted.catch(() => {});
    const pull = async (c: ReadableStreamDefaultController<Uint8Array>) => {
      const { done, value } = await Promise.race([reader.read(), aborted]);
      if (done) c.close();
      else c.enqueue(value);
    };
    return new Response(new ReadableStream({ pull }));
  }) as unknown as typeof fetch;
  await expect(fetchCatalog(registry, { fetch: withSignal, timeoutMs: 100 })).rejects.toThrow(/couldn't reach/);
});
