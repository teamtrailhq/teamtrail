import { useCallback, useEffect, useState } from 'react';
import { getRoles, postRoles } from './rolesApi';
import { setRolesView } from './rolesStore';
import type { AddResult, CatalogPreview, CatalogView } from './types';

const q = (registry?: string) => (registry ? `registry=${encodeURIComponent(registry)}` : '');

/**
 * One catalog's index (undefined while loading), why it couldn't be read, and the two steps of adding a role:
 * `preview` (fetched and linted, nothing written) and `add` (copied into roles/ and pinned).
 */
export function useCatalog(registry?: string) {
  const [index, setIndex] = useState<CatalogView>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    setIndex(undefined);
    setError(undefined);
    getRoles<CatalogView>(`/roles/catalog?${q(registry)}`).then(
      (v) => live && setIndex(v),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [registry]);
  const preview = useCallback(
    (id: string) => getRoles<CatalogPreview>(`/roles/catalog/preview?${q(registry)}&id=${encodeURIComponent(id)}`),
    [registry],
  );
  const add = useCallback(
    async (id: string) => {
      const r = await postRoles<AddResult>('/roles/catalog/add', { registry, id });
      setRolesView(r);
      return r.installed;
    },
    [registry],
  );
  return { index, error, preview, add };
}
