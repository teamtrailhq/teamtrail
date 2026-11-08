import path from 'node:path';
import { searchCatalog, type CatalogEntry } from '@teamtrail/core';
import { fetchCatalog } from '@teamtrail/core/agents';
import { pickRegistries } from './pickRegistry';
import type { GuidesArgs, GuidesIo } from './types';

/** `guides search [query]`: guides in the catalogs whose id, name, summary or author match every word. */
export async function guidesSearch(a: GuidesArgs, io: GuidesIo): Promise<number> {
  const root = path.resolve(a.dir);
  let found = 0;
  for (const registry of pickRegistries(root, a.registry)) {
    const index = await fetchCatalog(registry, { fetch: io.fetch });
    const hits = searchCatalog(index, { query: a.rest.join(' '), verifiedOnly: a.verified });
    found += hits.length;
    for (const e of hits) {
      const badge = badgeOf(e);
      const reported = e.reported ? ' · reported' : '';
      io.out(`${e.id.padEnd(14)} ${e.version.padEnd(8)} ${badge.padEnd(10)} ${e.author} · ${e.summary}${reported}\n`);
    }
  }
  if (!found) io.out('No guides match.\n');
  return 0;
}

function badgeOf(e: CatalogEntry) {
  if (e.builtin) return 'built in';
  return e.verified ? 'verified' : 'unreviewed';
}
