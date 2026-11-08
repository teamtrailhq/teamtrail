import type { CatalogEntry } from '../model/guide';
import { OperationError } from '../planning/operations/operationError';
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

/**
 * Adds (or updates) a guide from a catalog: fetched, sha-checked against the index, linted, copied into `guides/` and
 * pinned. Its proposed checks wait for the trail lead's approval (approveCheck.ts); nothing runs before that.
 */
export async function addFromCatalog(
  input: { root: string; registry: Registry; id: string; by: string } & CatalogFetch,
): Promise<Installed & { catalog: CatalogEntry }> {
  const { entry, text } = await previewCatalogGuide(input);
  const commit = entry.history.at(-1)?.commit;
  const source = { registry: input.registry.url, path: entry.path, ...(commit ? { commit } : {}) };
  const installed = installGuide({ root: input.root, text, source, by: input.by, expectId: entry.id });
  return { ...installed, catalog: entry };
}
