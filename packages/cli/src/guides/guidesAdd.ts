import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { findCatalogGuide, fetchCatalogGuide, readGuidesConfig } from '@teamtrail/core/agents';
import { installText } from './installText';
import type { GuidesArgs, GuidesIo } from './types';

/** A file path: ends in .md or exists. `catalog/id` is neither, so it names a catalog guide. */
const isFile = (ref: string) => ref.endsWith('.md') || existsSync(path.resolve(ref));

/**
 * `guides add <id>|<catalog/id>|<file.md>`: from a local file, or from the catalogs in guides.json, searched in order
 * (sha-checked against the index). An id in more than one catalog is refused until the person names one.
 */
export async function guidesAdd(a: GuidesArgs, io: GuidesIo): Promise<number> {
  const ref = a.rest[0];
  if (!ref) {
    io.err('usage: guides add <id>|<catalog/id>|<file.md> [--registry <name>] [--approve-checks]\n');
    return 2;
  }
  const root = path.resolve(a.dir);
  const common = { root, io, approveAll: a.approveChecks };
  if (isFile(ref)) {
    const text = readFileSync(path.resolve(ref), 'utf8');
    return installText({ ...common, text, source: 'local', where: ref });
  }
  const { registries } = readGuidesConfig(root).config;
  const hit = await findCatalogGuide({ registries, ref, only: a.registry, fetch: io.fetch });
  for (const u of hit.unreachable) io.err(`Couldn't read catalog ${u}\n`);
  const { registry, entry } = hit;
  io.out(`Found ${entry.id} ${entry.version} in catalog ${registry.name} (${registry.url})\n`);
  const text = await fetchCatalogGuide(registry, entry, { fetch: io.fetch });
  const commit = entry.history.at(-1)?.commit;
  const source = { registry: registry.url, path: entry.path, ...(commit ? { commit } : {}) };
  const where = `${registry.name}:${entry.path}`;
  return installText({ ...common, text, source, where, expectId: entry.id });
}
