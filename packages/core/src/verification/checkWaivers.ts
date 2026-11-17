import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { CheckWaiver } from '../model/checkWaiver';
import { OperationError } from '../planning/operations/operationError';

/** `<config dir>/projects/<project id>/waivers.json`: the trail lead's waivers, by trail and ticket. */
const FILE = 'waivers.json';

type Waivers = Record<string, CheckWaiver[]>;
const keyOf = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;

/** Read-modify-write under the file's lock; a config dir this process can't write refuses the change. */
function change(root: string, fn: (all: Waivers) => void) {
  try {
    const store = machineStore(root);
    mkdirSync(store.dir, { recursive: true, mode: 0o700 });
    withFileLock(store.file(`${FILE}.lock`), () => {
      const all = store.read<Waivers>(FILE) ?? {};
      fn(all);
      store.write(FILE, all);
    });
  } catch (e) {
    if (e instanceof OperationError) throw e;
    throw new OperationError(`Couldn't keep it in Teamtrail's config folder on this machine: ${(e as Error).message}`);
  }
}

/**
 * The trail lead's "Accept without <check>" records, kept in the machine store where an agent in the repo or a
 * teammate's push can't add one. A waiver that can't be read is no waiver: the checks run.
 */
export const checkWaivers = {
  /** Every waiver of the ticket, oldest first, undone ones included. */
  list(root: string, mapId: string, ticketId: string): CheckWaiver[] {
    try {
      return machineStore(root).read<Waivers>(FILE)?.[keyOf(mapId, ticketId)] ?? [];
    } catch {
      return [];
    }
  },

  add(root: string, w: CheckWaiver) {
    change(root, (all) => {
      const key = keyOf(w.mapId, w.ticketId);
      all[key] = [...(all[key] ?? []), w];
    });
  },

  /** Links a waiver to the decision record it was kept as. */
  linkDecision(root: string, w: CheckWaiver, decisionId: string) {
    change(root, (all) => {
      const key = keyOf(w.mapId, w.ticketId);
      all[key] = (all[key] ?? []).map((x) => (x.id === w.id ? { ...x, decisionId } : x));
    });
  },

  /** Marks the ticket's waivers undone; returns the ones it undid. */
  undo(root: string, o: { mapId: string; ticketId: string; by: string; at?: number }): CheckWaiver[] {
    const undone: CheckWaiver[] = [];
    change(root, (all) => {
      const key = keyOf(o.mapId, o.ticketId);
      all[key] = (all[key] ?? []).map((w) => {
        if (w.undone) return w;
        const next = { ...w, undone: { by: o.by, at: o.at ?? Date.now() } };
        undone.push(next);
        return next;
      });
    });
    return undone;
  },
};
