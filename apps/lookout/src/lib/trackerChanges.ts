import { apiBase } from './apiBase';
import { reloadIfSignedOut } from './signedOutReload';

/**
 * One shared `/events` stream: "a tracker file changed" messages and named server events (`attention`, …).
 * Browsers allow only six connections per host, and every EventSource holds one open, so hooks subscribe here
 * instead of opening their own.
 */
let stream: EventSource | undefined;
const listeners = new Set<(path: string) => void>();
const named = new Map<string, Set<(data: string) => void>>();

function listen(name: string) {
  stream?.addEventListener(name, (m) => {
    for (const l of named.get(name) ?? []) l((m as MessageEvent<string>).data);
  });
}

function open() {
  if (stream) return;
  stream = new EventSource(`${apiBase()}/events`);
  stream.onerror = reloadIfSignedOut;
  stream.onmessage = (m) => {
    const p = (JSON.parse(m.data) as { path?: unknown }).path;
    if (typeof p === 'string') for (const l of listeners) l(p);
  };
  for (const name of named.keys()) listen(name);
}

function closeIfIdle() {
  const anyNamed = [...named.values()].some((s) => s.size > 0);
  if (listeners.size || anyNamed) return;
  stream?.close();
  stream = undefined;
}

/** Calls `listener` with the path of every tracker file that changes. Returns the unsubscribe. */
export function onTrackerChange(listener: (path: string) => void) {
  listeners.add(listener);
  open();
  return () => {
    listeners.delete(listener);
    closeIfIdle();
  };
}

/** Subscribes to a named server event on the shared stream; the listener gets the raw `data`. */
export function onServerEvent(name: string, listener: (data: string) => void) {
  let set = named.get(name);
  if (!set) {
    set = new Set();
    named.set(name, set);
    listen(name);
  }
  set.add(listener);
  open();
  return () => {
    set.delete(listener);
    closeIfIdle();
  };
}

/** Like onServerEvent, with the data parsed as JSON (for events whose payload is JSON). */
export function onTrackerEvent(event: string, fn: (data: unknown) => void) {
  return onServerEvent(event, (raw) => fn(JSON.parse(raw) as unknown));
}
