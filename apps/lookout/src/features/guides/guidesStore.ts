import { onTrackerChange } from '../../lib/trackerChanges';
import { getGuides } from './guidesApi';
import type { GuidesView } from './types';

/*
 * One shared copy of GET /guides for every component that shows a guide (map nodes, the inspector, Settings), so a map
 * with fifty tickets makes one request. Reloaded when a file under guides/ or the guide lock changes.
 * undefined while loading, null without a server (static build).
 */
let view: GuidesView | null | undefined;
const subscribers = new Set<() => void>();
let unwatch: (() => void) | undefined;

export function setGuidesView(next: GuidesView | null) {
  view = next;
  for (const s of subscribers) s();
}

export function loadGuides() {
  getGuides<GuidesView>('/guides').then(setGuidesView, () => setGuidesView(null));
}

export const guidesSnapshot = () => view;

export function subscribeGuides(cb: () => void) {
  subscribers.add(cb);
  if (!unwatch) {
    loadGuides();
    unwatch = onTrackerChange((p) => {
      if (p.includes('guides')) loadGuides();
    });
  }
  return () => {
    subscribers.delete(cb);
    if (subscribers.size) return;
    unwatch?.();
    unwatch = undefined;
  };
}
