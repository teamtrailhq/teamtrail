import type { CatalogEntry, CatalogIndex } from '../model/guide';
import { OperationError } from '../planning/operations/operationError';
import { parseCatalogIndex } from './catalogIndex';
import { guideSha } from './guideHash';

export interface Registry {
  name: string;
  url: string;
}

export interface CatalogFetch {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const join = (base: string, rel: string) => `${base.replace(/\/+$/, '')}/${rel}`;

/** The most a catalog's index.json may be; a guide file has its own, smaller cap (guideLint's size rule). */
export const MAX_INDEX_BYTES = 1_048_576;
export const MAX_GUIDE_BYTES = 262_144;

/**
 * What a catalog file may be served as: JSON or text (raw GitHub serves text/plain), or no type at all. An HTML
 * page is a login wall, a captive portal or an error page, never a catalog.
 */
const SERVED_AS = /^(application\/(json|octet-stream)|text\/(plain|markdown|x-markdown))\b/i;

async function get(url: string, opts: CatalogFetch & { maxBytes: number }): Promise<string> {
  const f = opts.fetch ?? fetch;
  // One deadline for the answer and its body: a server that trickles bytes is cut off with it.
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 15_000);
  let res: Response;
  try {
    res = await f(url, { signal, redirect: 'error' });
  } catch (e) {
    throw new OperationError(`couldn't reach ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new OperationError(`${url} answered ${res.status}`);
  const type = res.headers.get('content-type');
  if (type && !SERVED_AS.test(type)) {
    await res.body?.cancel().catch(() => {});
    throw new OperationError(`${url} answered with ${type.split(';')[0]}, not a catalog file`);
  }
  return readCapped(res, { url, maxBytes: opts.maxBytes });
}

/** The body as text, refused as soon as it passes `maxBytes`, whatever Content-Length said. */
async function readCapped(res: Response, o: { url: string; maxBytes: number }) {
  const tooBig = () => new OperationError(`${o.url} answered with more than ${o.maxBytes} bytes, not a catalog file`);
  if (Number(res.headers.get('content-length') ?? 0) > o.maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw tooBig();
  }
  if (!res.body) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.byteLength;
      if (size > o.maxBytes) throw tooBig();
      chunks.push(chunk);
    }
  } catch (e) {
    await res.body.cancel().catch(() => {});
    if (e instanceof OperationError) throw e;
    throw new OperationError(`couldn't reach ${o.url}: ${(e as Error).message}`);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** A catalog's `index.json`, read-only over HTTPS. */
export async function fetchCatalog(registry: Registry, opts: CatalogFetch = {}): Promise<CatalogIndex> {
  const text = await get(join(registry.url, 'index.json'), { ...opts, maxBytes: MAX_INDEX_BYTES });
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new OperationError(`${registry.name}: index.json is not JSON`);
  }
  const index = parseCatalogIndex(raw);
  if (!index) throw new OperationError(`${registry.name}: index.json is not a guide catalog (v 1)`);
  return index;
}

/** One guide file from a catalog, refused unless its sha256 matches the index. */
export async function fetchCatalogGuide(registry: Registry, entry: CatalogEntry, opts: CatalogFetch = {}) {
  const text = await get(join(registry.url, entry.path), { ...opts, maxBytes: MAX_GUIDE_BYTES });
  if (guideSha(text) !== entry.sha256)
    throw new OperationError(
      `${entry.id} ${entry.version}: the file doesn't match the catalog's sha256; not installed`,
    );
  return text;
}
