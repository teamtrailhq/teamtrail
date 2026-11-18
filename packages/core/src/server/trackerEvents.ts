import type { IncomingMessage, ServerResponse } from 'node:http';
import { TrackerError } from '../adapters/remote/http';
import type { SyncedAdapter } from '../adapters/remote/sync/syncedAdapter';
import { openEventStream } from './http';

export interface TrackerEventSource {
  /** The adapter the project uses now. */
  adapter: () => Promise<SyncedAdapter>;
  /** Called when that adapter is replaced (signed in or out, another repo, team or token, a tracker reset). */
  onReplaced: (fn: () => void) => () => void;
}

/**
 * SSE: each TrackerEvent as a message, plus named `status` events (SyncStatus & { location }). When the adapter is
 * replaced the stream moves to the new one and says so (a status, and `external.changed` so pages read again), so
 * an open page never stays on a disposed adapter that no longer polls.
 */
export function streamTrackerEvents(source: TrackerEventSource, req: IncomingMessage, res: ServerResponse) {
  openEventStream(res);
  let off = () => {};
  let closed = false;
  let attached = 0;
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  const offReplaced = source.onReplaced(() => {
    off();
    off = () => {};
    attach(true);
  });
  req.on('close', () => {
    closed = true;
    clearInterval(ping);
    offReplaced();
    off();
  });
  function attach(again: boolean) {
    const n = ++attached;
    source.adapter().then(
      (a) => {
        if (closed || n !== attached) return;
        const status = () =>
          res.write(`event: status\ndata: ${JSON.stringify({ ...a.status, location: a.location })}\n\n`);
        const offEvents = a.subscribe((e) => res.write(`data: ${JSON.stringify(e)}\n\n`));
        const offStatus = a.onStatus(status);
        off = () => {
          offEvents();
          offStatus();
        };
        status();
        if (again) res.write(`data: ${JSON.stringify({ kind: 'external.changed', at: Date.now() })}\n\n`);
      },
      (e: Error) => {
        if (closed || n !== attached) return;
        const state = e instanceof TrackerError && e.code === 'auth' ? 'auth-error' : 'offline';
        res.write(`event: status\ndata: ${JSON.stringify({ state, queued: 0, error: e.message })}\n\n`);
      },
    );
  }
  attach(false);
}
