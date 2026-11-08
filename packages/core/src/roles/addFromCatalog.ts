import type { CatalogEntry } from '../model/role';
import { OperationError } from '../planning/operations/operationError';
import { fetchCatalog, fetchCatalogRole, type CatalogFetch, type Registry } from './catalogClient';
import { installRole, type Installed } from './installRole';
import { lintRole } from './roleLint';

/** A catalog role and its file, fetched and checked against the index, before anything is written. */
export async function previewCatalogRole(input: { registry: Registry; id: string } & CatalogFetch) {
  const index = await fetchCatalog(input.registry, input);
  const entry = index.roles.find((e) => e.id === input.id);
  if (!entry) throw new OperationError(`${input.registry.name} has no role "${input.id}"`);
  const text = await fetchCatalogRole(input.registry, entry, input);
  return { entry, text, lint: lintRole(text), repo: index.repo };
}

/**
 * Adds (or updates) a role from a catalog: fetched, sha-checked against the index, linted, copied into `roles/` and
 * pinned. Its proposed checks wait for the trail lead's approval (approveCheck.ts); nothing runs before that.
 */
export async function addFromCatalog(
  input: { root: string; registry: Registry; id: string; by: string } & CatalogFetch,
): Promise<Installed & { catalog: CatalogEntry }> {
  const { entry, text } = await previewCatalogRole(input);
  const commit = entry.history.at(-1)?.commit;
  const source = { registry: input.registry.url, path: entry.path, ...(commit ? { commit } : {}) };
  const installed = installRole({ root: input.root, text, source, by: input.by, expectId: entry.id });
  return { ...installed, catalog: entry };
}
