import path from 'node:path';
import { searchCatalog } from '@teamtrail/core';
import { fetchCatalog } from '@teamtrail/core/agents';
import { pickRegistries } from './pickRegistry';
import type { RolesArgs, RolesIo } from './types';

/** `roles search [query]`: roles in the catalogs whose id, name, summary or author match every word. */
export async function rolesSearch(a: RolesArgs, io: RolesIo): Promise<number> {
  const root = path.resolve(a.dir);
  let found = 0;
  for (const registry of pickRegistries(root, a.registry)) {
    const index = await fetchCatalog(registry, { fetch: io.fetch });
    const hits = searchCatalog(index, { query: a.rest.join(' '), verifiedOnly: a.verified });
    found += hits.length;
    for (const e of hits) {
      const badge = e.verified ? 'verified' : 'unreviewed';
      const reported = e.reported ? ' · reported' : '';
      io.out(`${e.id.padEnd(14)} ${e.version.padEnd(8)} ${badge.padEnd(10)} ${e.author} · ${e.summary}${reported}\n`);
    }
  }
  if (!found) io.out('No roles match.\n');
  return 0;
}
