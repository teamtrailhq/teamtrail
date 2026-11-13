import type { TrackerAdapter } from '../adapters/adapter';
import type { TrackerEvent } from '../model/types';
import type { CallName } from './trackerCalls';
import type { TrackerRoutesOptions } from './trackerContext';
import { createTrackerRoutes } from './trackerRoutes';

/**
 * The project's active tracker as a plain adapter, for processes without the
 * HTTP bridge (the MCP server). Every call re-reads `trackers.json`, so
 * connecting GitHub or Linear in Settings applies without restarting the agent;
 * a remote tracker that can't be reached fails the call instead of falling back
 * to local markdown.
 */
export function activeTracker(o: TrackerRoutesOptions): TrackerAdapter & { dispose(): void } {
  const routes = createTrackerRoutes(o);
  const listeners = new Set<(e: TrackerEvent) => void>();
  let current: TrackerAdapter = o.markdown;
  let off: () => void = () => {};
  const attach = () => {
    off();
    off = listeners.size ? current.subscribe((e) => listeners.forEach((l) => l(e))) : () => {};
  };
  const use = async () => {
    const a = await routes.active();
    if (a !== current) {
      current = a;
      attach();
    }
    return a;
  };
  const call = <K extends CallName>(k: K) =>
    (async (...args: unknown[]) => {
      const a = await use();
      return (a[k] as (...x: unknown[]) => unknown).apply(a, args);
    }) as TrackerAdapter[K];
  return {
    get kind() {
      return current.kind;
    },
    get label() {
      return current.label;
    },
    get location() {
      return current.location;
    },
    listMaps: call('listMaps'),
    loadMap: call('loadMap'),
    createMap: call('createMap'),
    setMapMode: call('setMapMode'),
    setMapArchived: call('setMapArchived'),
    setMapMeta: call('setMapMeta'),
    updateMapSections: call('updateMapSections'),
    createTicket: call('createTicket'),
    addBlocking: call('addBlocking'),
    removeBlocking: call('removeBlocking'),
    editTicket: call('editTicket'),
    reopen: call('reopen'),
    assign: call('assign'),
    comment: call('comment'),
    close: call('close'),
    setMeta: call('setMeta'),
    listDecisions: call('listDecisions'),
    createDecision: call('createDecision'),
    markSuperseded: call('markSuperseded'),
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) attach();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) attach();
      };
    },
    dispose() {
      listeners.clear();
      off();
      routes.close();
    },
  };
}
