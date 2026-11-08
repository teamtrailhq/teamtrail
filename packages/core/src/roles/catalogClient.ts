import type { CatalogEntry, CatalogIndex } from '../model/role';
import { OperationError } from '../planning/operations/operationError';
import { parseCatalogIndex } from './catalogIndex';
import { roleSha } from './roleHash';

export interface Registry {
  name: string;
  url: string;
}

export interface CatalogFetch {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const join = (base: string, rel: string) => `${base.replace(/\/+$/, '')}/${rel}`;

async function get(url: string, opts: CatalogFetch): Promise<string> {
  const f = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(url, { signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), redirect: 'error' });
  } catch (e) {
    throw new OperationError(`couldn't reach ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) throw new OperationError(`${url} answered ${res.status}`);
  return res.text();
}

/** A catalog's `index.json`, read-only over HTTPS. */
export async function fetchCatalog(registry: Registry, opts: CatalogFetch = {}): Promise<CatalogIndex> {
  const text = await get(join(registry.url, 'index.json'), opts);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new OperationError(`${registry.name}: index.json is not JSON`);
  }
  const index = parseCatalogIndex(raw);
  if (!index) throw new OperationError(`${registry.name}: index.json is not a role catalog (v 1)`);
  return index;
}

/** One role file from a catalog, refused unless its sha256 matches the index. */
export async function fetchCatalogRole(registry: Registry, entry: CatalogEntry, opts: CatalogFetch = {}) {
  const text = await get(join(registry.url, entry.path), opts);
  if (roleSha(text) !== entry.sha256)
    throw new OperationError(`${entry.id} ${entry.version}: the file doesn't match the catalog's sha256; not installed`);
  return text;
}
