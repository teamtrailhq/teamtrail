import type { CatalogEntry } from '../model/guide';
import { OperationError } from '../planning/operations/operationError';
import { assertNotBuiltin } from './addFromCatalog';
import { BUILTIN_GUIDES } from './builtin/builtinGuides';
import { fetchCatalog, type CatalogFetch, type Registry } from './catalogClient';

/** A guide found in one catalog: where it is, its index entry, and the catalog repo (for report links). */
export interface CatalogHit {
  registry: Registry;
  entry: CatalogEntry;
  repo?: string;
}

/** `catalog/id` names the catalog; a plain id doesn't. */
export function parseGuideRef(ref: string): { catalog?: string; id: string } {
  const slash = ref.indexOf('/');
  if (slash < 0) return { id: ref };
  return { catalog: ref.slice(0, slash), id: ref.slice(slash + 1) };
}

async function hitsIn(registries: Registry[], id: string, opts: CatalogFetch) {
  const hits: CatalogHit[] = [];
  const unreachable: string[] = [];
  for (const registry of registries) {
    try {
      const index = await fetchCatalog(registry, opts);
      const entry = index.guides.find((e) => e.id === id);
      if (entry) hits.push({ registry, entry, ...(index.repo ? { repo: index.repo } : {}) });
    } catch (e) {
      if (!(e instanceof OperationError)) throw e;
      unreachable.push(`${registry.name} (${e.message})`);
    }
  }
  return { hits, unreachable };
}

const notFound = (id: string, searched: Registry[], unreachable: string[]) => {
  const names = searched.map((r) => r.name).join(', ');
  const down = unreachable.length ? `; couldn't read ${unreachable.join(', ')}` : '';
  return new OperationError(`no catalog has a guide "${id}" (searched ${names || 'no catalogs'}${down})`);
};

/**
 * Finds a guide in the configured catalogs, in order. `catalog/id` (or `only`) looks in that one catalog. A built-in
 * guide's copy is never a match to add. An id in more than one catalog is refused, naming them, so the person picks
 * one with `catalog/id`. `unreachable` lists catalogs that couldn't be read while searching.
 */
export async function findCatalogGuide(
  input: { registries: Registry[]; ref: string; only?: string } & CatalogFetch,
): Promise<CatalogHit & { unreachable: string[] }> {
  const { catalog, id } = parseGuideRef(input.ref);
  const name = catalog ?? input.only;
  const searched = name ? input.registries.filter((r) => r.name === name) : input.registries;
  if (name && !searched.length)
    throw new OperationError(
      `no catalog named "${name}" (have: ${input.registries.map((r) => r.name).join(', ') || 'none'})`,
    );
  const { hits, unreachable } = await hitsIn(searched, id, input);
  const addable = hits.filter((h) => !(h.entry.builtin && h.entry.id in BUILTIN_GUIDES));
  if (!addable.length && hits.length) assertNotBuiltin(hits[0].entry);
  if (!addable.length) throw notFound(id, searched, unreachable);
  if (addable.length > 1) {
    const refs = addable.map((h) => `${h.registry.name}/${id}`).join(' or ');
    throw new OperationError(`"${id}" is in more than one catalog; say which: ${refs}`);
  }
  return { ...addable[0], unreachable };
}
