import { existsSync } from 'node:fs';
import { watchTree } from '../lib/watchTree';
import { machineStore } from '../machine/machineStore';
import { workChangeLabel } from './workChangeLabel';

type Listener = (what: string) => void;

interface Shared {
  listeners: Set<Listener>;
  stop: () => void;
}

/** One watch per folder, however many agents wait on it: an HTTP server holds many sessions in one process. */
const shared = new Map<string, Shared>();

function watchShared(dir: string, label: (rel: string) => string | undefined, fn: Listener): () => void {
  let entry = shared.get(dir);
  if (!entry) {
    if (!existsSync(dir)) return () => {};
    const listeners = new Set<Listener>();
    let stop: () => void;
    try {
      stop = watchTree(dir, (rel) => {
        const what = label(rel);
        if (what) for (const l of listeners) l(what);
      });
    } catch {
      return () => {};
    }
    entry = { listeners, stop };
    shared.set(dir, entry);
  }
  const e = entry;
  e.listeners.add(fn);
  return () => {
    e.listeners.delete(fn);
    if (e.listeners.size || shared.get(dir) !== e) return;
    shared.delete(dir);
    e.stop();
  };
}

/** In this machine's store, what the trail lead approved here (criteria, briefs, reroutes) and signed state. */
const machineLabel = (rel: string) => (/^sign-in/.test(rel) ? undefined : 'something was approved on this machine');

/**
 * Calls `onChange` with a few words on what changed whenever something that can let work be claimed changes for the
 * tracker folder `root`: its files (workChangeLabel.ts) and this machine's approvals of them (machineStore.ts).
 * Folders that don't exist yet are not watched; a waiting agent re-checks on a timer besides. Returns the stop
 * function.
 */
export function watchWorkChanges(root: string, onChange: (what: string) => void, opts: { configDir?: string } = {}) {
  const store = machineStore(root, opts.configDir).dir;
  const stops = [watchShared(root, workChangeLabel, onChange), watchShared(store, machineLabel, onChange)];
  return () => {
    for (const stop of stops) stop();
  };
}
