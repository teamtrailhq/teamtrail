import { useCallback, useSyncExternalStore } from 'react';
import { postGuides } from './guidesApi';
import { guidesSnapshot, setGuidesView, subscribeGuides } from './guidesStore';
import type { GuidesView } from './types';

/**
 * The project's guides (built in and installed, each with its status) and the trail lead's actions on them.
 * `act` posts to a guides route and resolves to an error message, if any.
 */
export function useGuides() {
  const view = useSyncExternalStore(subscribeGuides, guidesSnapshot);
  const act = useCallback(async (path: string, body: unknown): Promise<string | undefined> => {
    try {
      setGuidesView(await postGuides<GuidesView>(path, body));
      return undefined;
    } catch (e) {
      return (e as Error).message;
    }
  }, []);
  const find = useCallback((id?: string) => (id ? view?.guides.find((r) => r.id === id) : undefined), [view]);
  return { view, act, find };
}
