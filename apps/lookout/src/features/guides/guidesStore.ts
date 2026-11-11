import { type LiveLoader, liveLoad } from '../../lib/liveLoad';
import { getGuides } from './guidesApi';
import type { GuidesView } from './types';

/*
 * One shared copy of GET /guides for every component that shows a guide (map nodes, the inspector, Settings), so a map
 * with fifty tickets makes one request. Reloaded when a file under guides/ or the guide lock changes, and when the
 * event stream opens. undefined while loading, null without a server (static build).
 */
let view: GuidesView | null | undefined;
const subscribers = new Set<() => void>();
let live: LiveLoader | undefined;

function show(next: GuidesView | null) {
  view = next;
  for (const s of subscribers) s();
}

/** The view as the server answered an action with it: a load started before it is older. */
export function setGuidesView(next: GuidesView | null) {
  live?.pushed();
  show(next);
}

export const guidesSnapshot = () => view;

export function subscribeGuides(cb: () => void) {
  subscribers.add(cb);
  live ??= liveLoad({
    load: () => getGuides<GuidesView>('/guides'),
    show,
    failed: () => show(null),
    changed: (p) => p.includes('guides'),
  });
  return () => {
    subscribers.delete(cb);
    if (subscribers.size) return;
    live?.stop();
    live = undefined;
  };
}
