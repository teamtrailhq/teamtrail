import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseGuide, type GuideLockEntry } from '@teamtrail/core';
import {
  fetchCatalog,
  fetchCatalogGuide,
  guideFilePath,
  guideSha,
  readApprovedLock,
  readGuideLock,
} from '@teamtrail/core/agents';
import { installText } from './installText';
import { registryForUrl } from './pickRegistry';
import type { GuidesArgs, GuidesIo } from './types';
import { updateChanges } from './updateChanges';

/** The installed file, when it is still the version approved here. */
function approvedText(root: string, id: string, entry: GuideLockEntry) {
  try {
    const text = readFileSync(guideFilePath(root, id), 'utf8');
    return guideSha(text) === entry.sha256 ? { text, guide: parseGuide(text).guide } : undefined;
  } catch {
    return undefined;
  }
}

/** One guide: fetched from the catalog it was approved from here, shown with its changes, installed on a yes. */
async function updateOne(a: GuidesArgs & { root: string }, io: GuidesIo, id: string, entry: GuideLockEntry) {
  if (entry.source === 'local') {
    if (a.rest.includes(id)) io.out(`${id}: a local file, not from a catalog; edit it and approve it in the Lookout\n`);
    return 0;
  }
  const registry = registryForUrl(a.root, entry.source.registry);
  if (!registry) {
    io.err(
      `${id}: it came from ${entry.source.registry}, which isn't one of the catalogs approved here; not fetched\n`,
    );
    return 1;
  }
  const index = await fetchCatalog(registry, { fetch: io.fetch });
  const latest = index.guides.find((e) => e.id === id);
  if (!latest) return (io.err(`${id}: no longer in ${registry.name}\n`), 1);
  if (latest.sha256 === entry.sha256) return (io.out(`${id} ${entry.version}: up to date\n`), 0);
  io.out(`${id}: ${entry.version} → ${latest.version} from ${registry.name} (${registry.url})\n`);
  const text = await fetchCatalogGuide(registry, latest, { fetch: io.fetch });
  const guide = parseGuide(text).guide;
  const changes = guide ? updateChanges({ before: approvedText(a.root, id, entry), text, guide }) : [];
  const commit = latest.history.at(-1)?.commit;
  const source = { registry: registry.url, path: latest.path, ...(commit ? { commit } : {}) };
  const where = `${registry.name}:${latest.path}`;
  const sha256 = a.sha256 ? { sha256: a.sha256 } : {};
  // every new or changed check is asked about on its own: --approve-checks doesn't reach an update
  return installText({ root: a.root, text, source, io, where, expectId: id, approveAll: false, changes, ...sha256 });
}

/**
 * `guides update [id...]`: for each catalog guide approved on this machine (all, or the named ones), fetches the
 * catalog's version from the catalog it was approved from, when that is still an approved catalog, and when it
 * differs shows what changed and installs it only on the person's yes (or `--sha256` naming it). The repo's lock is
 * never the source: a guide pinned there but not approved here is reported, not fetched. Checks wait for their own yes.
 */
export async function guidesUpdate(a: GuidesArgs, io: GuidesIo): Promise<number> {
  const root = path.resolve(a.dir);
  const approved = readApprovedLock(root).guides;
  const pinned = readGuideLock(root).guides;
  const ids = a.rest.length ? a.rest : Object.keys(approved);
  let code = 0;
  for (const id of ids) {
    const entry = approved[id];
    if (entry) {
      code = Math.max(code, await updateOne({ ...a, root }, io, id, entry));
      continue;
    }
    const why = pinned[id]
      ? 'is not approved on this machine yet; approve it in the Lookout first'
      : 'is not installed';
    io.err(`${id} ${why}\n`);
    code = 1;
  }
  return code;
}
