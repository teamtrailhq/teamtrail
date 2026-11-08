import { useCallback, useEffect, useState } from 'react';
import { getGuides, postGuides } from './guidesApi';
import { setGuidesView } from './guidesStore';
import type { AddResult, CatalogPreview, CatalogView } from './types';

const q = (registry?: string) => (registry ? `registry=${encodeURIComponent(registry)}` : '');

/**
 * One catalog's index (undefined while loading), why it couldn't be read, and the two steps of adding a guide:
 * `preview` (fetched and linted, nothing written) and `add` (copied into guides/ and pinned).
 */
export function useCatalog(registry?: string) {
  const [index, setIndex] = useState<CatalogView>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let live = true;
    setIndex(undefined);
    setError(undefined);
    getGuides<CatalogView>(`/guides/catalog?${q(registry)}`).then(
      (v) => live && setIndex(v),
      (e: Error) => live && setError(e.message),
    );
    return () => {
      live = false;
    };
  }, [registry]);
  const preview = useCallback(
    (id: string) => getGuides<CatalogPreview>(`/guides/catalog/preview?${q(registry)}&id=${encodeURIComponent(id)}`),
    [registry],
  );
  const add = useCallback(
    async (id: string) => {
      const r = await postGuides<AddResult>('/guides/catalog/add', { registry, id });
      setGuidesView(r);
      return r.installed;
    },
    [registry],
  );
  return { index, error, preview, add };
}
