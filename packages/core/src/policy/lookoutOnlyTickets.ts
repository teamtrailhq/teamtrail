import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { RiskCategory } from '../model/risk';

/** `<config dir>/projects/<project id>/lookout-only.json`: tickets only the Lookout may decide, by trail and ticket. */
const FILE = 'lookout-only.json';

type Marks = Record<string, { at: number; categories: RiskCategory[] }>;
const keyOf = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;

/**
 * The durable record that a high-risk question was asked on a ticket, kept in the machine store where an agent in
 * the repo can't remove it, and never aging out the way session docs do. `ticketNeedsLookout` reads it next to the
 * history. Marks only ever add: nothing here clears one. Questions about the trail as a whole mark no ticket.
 */
export const lookoutOnlyTickets = {
  /** Records it; a config dir this process can't write leaves the history as the only record. */
  mark(root: string, o: { mapId: string; ticketId: string; categories: RiskCategory[]; at?: number }) {
    try {
      const store = machineStore(root);
      mkdirSync(store.dir, { recursive: true, mode: 0o700 });
      withFileLock(store.file(`${FILE}.lock`), () => {
        const marks = store.read<Marks>(FILE) ?? {};
        const was = marks[keyOf(o.mapId, o.ticketId)];
        const categories = [...new Set([...(was?.categories ?? []), ...o.categories])];
        marks[keyOf(o.mapId, o.ticketId)] = { at: was?.at ?? o.at ?? Date.now(), categories };
        store.write(FILE, marks);
      });
    } catch {
      /* the session docs still hold the question */
    }
  },

  has(root: string, mapId: string, ticketId: string): boolean {
    try {
      return !!machineStore(root).read<Marks>(FILE)?.[keyOf(mapId, ticketId)];
    } catch {
      return false;
    }
  },
};
