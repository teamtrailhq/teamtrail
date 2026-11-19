import { refusedWrites } from './refusedWrites';
import type { RefusedSink } from './sync/types';
import { ticketOfWrite } from './ticketOfWrite';
import type { RemoteKind } from './types';

/**
 * Where an adapter keeps the writes its tracker refused for good: this project's `tracker-refused.json` on this
 * machine (refusedWrites.ts), each with the tracker target's outbox key, so Retry sends it back to the same queue,
 * and the issue's page when `issueUrl` knows it.
 */
export function refusedSink(o: {
  root: string;
  configDir?: string;
  tracker: RemoteKind;
  key: string;
  issueUrl?: (issue: string) => string;
}): RefusedSink {
  return {
    add({ write, error, at }) {
      const issue = ticketOfWrite(write) ?? write.mapId;
      const url = o.issueUrl?.(issue);
      refusedWrites(o.root, o.configDir).add({
        write,
        tracker: o.tracker,
        key: o.key,
        error,
        at,
        ...(url ? { url } : {}),
      });
    },
  };
}
