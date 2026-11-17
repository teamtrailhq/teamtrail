import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { MergeAcceptance } from '../model/mergeAnyway';
import { OperationError } from '../planning/operations/operationError';

/** `<config dir>/projects/<project id>/merge-anyway.json`: the trail lead's Merge anyway, by trail and ticket. */
const FILE = 'merge-anyway.json';
const KEPT = 20;

type All = Record<string, MergeAcceptance[]>;
const keyOf = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;

/**
 * The trail lead's Merge anyway records, in the machine store where an agent in the repo or a teammate's push can't
 * add one. One that can't be read is none: nothing unverified is merged on it.
 */
export const mergeAcceptances = {
  /** The ticket's latest, if any. */
  latest(root: string, mapId: string, ticketId: string): MergeAcceptance | undefined {
    try {
      return machineStore(root).read<All>(FILE)?.[keyOf(mapId, ticketId)]?.at(-1);
    } catch {
      return undefined;
    }
  },

  /** Adds one; a config dir this process can't write refuses it. */
  add(root: string, a: MergeAcceptance) {
    try {
      const store = machineStore(root);
      mkdirSync(store.dir, { recursive: true, mode: 0o700 });
      withFileLock(store.file(`${FILE}.lock`), () => {
        const all = store.read<All>(FILE) ?? {};
        const key = keyOf(a.mapId, a.ticketId);
        all[key] = [...(all[key] ?? []), a].slice(-KEPT);
        store.write(FILE, all);
      });
    } catch (e) {
      throw new OperationError(
        `Couldn't keep it in Teamtrail's config folder on this machine: ${(e as Error).message}`,
      );
    }
  },

  /** The ticket's latest, when it accepted exactly these gaps on this commit: what a server that merges asks. */
  covering(root: string, o: { mapId: string; ticketId: string; gapsHash: string }): MergeAcceptance | undefined {
    const a = mergeAcceptances.latest(root, o.mapId, o.ticketId);
    return a?.gapsHash === o.gapsHash ? a : undefined;
  },
};
