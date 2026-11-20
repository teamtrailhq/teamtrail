import type { ReadinessHost, RepoReadiness, TrailReadiness } from '../model/readiness';
import type { MapSnapshot } from '../model/types';
import { readinessHold } from './readinessHold';
import { readinessHost } from './readinessHost';
import { readReadiness } from './readReadiness';

/**
 * Repo readiness for the attention queue: read through `host` (default: this machine's checkout, probed here), with
 * what it holds on each active trail. Undefined when it can't be read (no checkout).
 */
export async function readinessForTrails(o: {
  root: string;
  snaps: MapSnapshot[];
  host?: ReadinessHost;
}): Promise<{ readiness: RepoReadiness; held: TrailReadiness[] } | undefined> {
  const { root } = o;
  try {
    const host = readinessHost({ root, host: o.host });
    const readiness = await readReadiness({ root, files: host.files(), probe: host.probe });
    if (!readiness.read) return undefined;
    const held = o.snaps.map((snap) => {
      const hold = readinessHold({ root, snap, readiness });
      return {
        mapId: snap.map.id,
        tickets: hold.held.map((t) => t.id),
        waits: hold.waits,
        started: !!hold.startedAnyway,
      };
    });
    return { readiness, held };
  } catch {
    return undefined;
  }
}
