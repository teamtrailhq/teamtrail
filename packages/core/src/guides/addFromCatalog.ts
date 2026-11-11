import type { CatalogEntry } from '../model/guide';
import { OperationError } from '../planning/operations/operationError';
import { BUILTIN_GUIDES } from './builtin/builtinGuides';
import { fetchCatalog, fetchCatalogGuide, type CatalogFetch, type Registry } from './catalogClient';
import { lintGuide } from './guideLint';
import { installGuide, type Installed } from './installGuide';

/** A catalog guide and its file, fetched and checked against the index, before anything is written. */
export async function previewCatalogGuide(input: { registry: Registry; id: string } & CatalogFetch) {
  const index = await fetchCatalog(input.registry, input);
  const entry = index.guides.find((e) => e.id === input.id);
  if (!entry) throw new OperationError(`${input.registry.name} has no guide "${input.id}"`);
  const text = await fetchCatalogGuide(input.registry, entry, input);
  return { entry, text, lint: lintGuide(text), repo: index.repo };
}

/** A catalog's copy of a built-in guide is for reading: the guide is already available, so it's never added. */
export function assertNotBuiltin(entry: CatalogEntry) {
  if (entry.builtin && entry.id in BUILTIN_GUIDES)
    throw new OperationError(`${entry.id} is built into Teamtrail and already available; there's nothing to add`);
}

/**
 * Adds (or updates) a guide from a catalog: fetched, sha-checked against the index, linted, copied into `guides/` and
 * pinned with the catalog's review (display only). `sha256` is the file the person was shown. Its proposed checks wait for the trail lead's approval (approveCheck.ts); nothing runs before that.
 */
export async function addFromCatalog(
  input: { root: string; registry: Registry; id: string; by: string; sha256?: string } & CatalogFetch,
): Promise<Installed & { catalog: CatalogEntry }> {
  const { entry, text } = await previewCatalogGuide(input);
  assertNotBuiltin(entry);
  // the person approved the file they were shown: one the catalog changed since is shown again, never added unseen
  if (input.sha256 && input.sha256 !== entry.sha256)
    throw new OperationError(`${entry.id} changed in the catalog since it was shown to you; look at it again`);
  const commit = entry.history.at(-1)?.commit;
  const source = { registry: input.registry.url, path: entry.path, ...(commit ? { commit } : {}) };
  const review = { verified: entry.verified, reviewedBy: entry.reviewedBy };
  const installed = installGuide({ root: input.root, text, source, by: input.by, expectId: entry.id, review });
  return { ...installed, catalog: entry };
}
