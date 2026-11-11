import { SessionEventSource } from './sessionEvents';
import { reloadIfSignedOut } from './signedOutReload';

/**
 * One shared `/events` stream: "a tracker file changed" messages and named server events (`attention`, …).
 * Browsers allow only six connections per host, and every EventSource holds one open, so hooks subscribe here
 * instead of opening their own.
 */
let stream: SessionEventSource | undefined;
const listeners = new Set<(path: string) => void>();
const named = new Map<string, Set<(data: string) => void>>();
const opened = new Set<() => void>();

function listen(name: string) {
  stream?.addEventListener(name, (m) => {
    for (const l of named.get(name) ?? []) l((m as MessageEvent<string>).data);
  });
}

function open() {
  if (stream) return;
  stream = new SessionEventSource();
  stream.onerror = reloadIfSignedOut;
  // the stream starts after the page's first loads and reconnects after a drop: what changed meanwhile was never sent
  stream.addEventListener('open', () => {
    for (const l of opened) l();
  });
  stream.onmessage = (m) => {
    const p = (JSON.parse((m as MessageEvent<string>).data) as { path?: unknown }).path;
    if (typeof p === 'string') for (const l of listeners) l(p);
  };
  for (const name of named.keys()) listen(name);
}

function closeIfIdle() {
  const anyNamed = [...named.values()].some((s) => s.size > 0);
  if (listeners.size || anyNamed || opened.size) return;
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

/**
 * Calls `listener` each time the stream opens: once the page is connected, and again after every reconnect. Changes
 * made before then were never sent, so a view that loaded earlier loads again. Returns the unsubscribe.
 */
export function onStreamOpen(listener: () => void) {
  opened.add(listener);
  open();
  return () => {
    opened.delete(listener);
    closeIfIdle();
  };
}
