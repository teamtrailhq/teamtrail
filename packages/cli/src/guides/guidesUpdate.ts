import path from 'node:path';
import { fetchCatalog, fetchCatalogGuide, readGuideLock } from '@teamtrail/core/agents';
import { installText } from './installText';
import { registryForUrl } from './pickRegistry';
import type { GuidesArgs, GuidesIo } from './types';

/**
 * `guides update [id...]`: re-fetches catalog guides (all, or the named ones) and installs the catalog's version when it
 * differs from the pinned one. Checks whose argv changed wait for approval again.
 */
export async function guidesUpdate(a: GuidesArgs, io: GuidesIo): Promise<number> {
  const root = path.resolve(a.dir);
  const pinned = Object.entries(readGuideLock(root).guides).filter(([id]) => !a.rest.length || a.rest.includes(id));
  const unknown = a.rest.filter((id) => !pinned.some(([p]) => p === id));
  for (const id of unknown) io.err(`${id} is not installed\n`);
  let code = unknown.length ? 1 : 0;
  for (const [id, entry] of pinned) {
    if (entry.source === 'local') {
      if (a.rest.includes(id))
        io.out(`${id}: a local file, not from a catalog; edit it and approve it in the Lookout\n`);
      continue;
    }
    const registry = registryForUrl(root, entry.source.registry);
    const index = await fetchCatalog(registry, { fetch: io.fetch });
    const latest = index.guides.find((e) => e.id === id);
    if (!latest) {
      io.err(`${id}: no longer in ${registry.name}\n`);
      code = 1;
      continue;
    }
    if (latest.sha256 === entry.sha256) {
      io.out(`${id} ${entry.version}: up to date\n`);
      continue;
    }
    io.out(`${id}: ${entry.version} → ${latest.version}\n`);
    const text = await fetchCatalogGuide(registry, latest, { fetch: io.fetch });
    const commit = latest.history.at(-1)?.commit;
    const source = { registry: registry.url, path: latest.path, ...(commit ? { commit } : {}) };
    const r = await installText({
      root,
      text,
      source,
      io,
      where: `${registry.name}:${latest.path}`,
      expectId: id,
      approveAll: a.approveChecks,
    });
    code = Math.max(code, r);
  }
  return code;
}
