import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { RuleWaiver } from '../model/diffRule';
import { OperationError } from '../planning/operations/operationError';

/** `<config dir>/projects/<project id>/rule-waivers.json`: the trail lead's rule waivers, by trail and ticket. */
const FILE = 'rule-waivers.json';

type Waivers = Record<string, RuleWaiver[]>;
const keyOf = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;

/**
 * The trail lead's "Go without R-1" records, kept in the machine store where an agent in the repo or a teammate's
 * push can't add one. A store that can't be read holds no waiver: the rule's question still needs its answer.
 */
export const ruleWaivers = {
  /** The ticket's waivers, oldest first. */
  list(root: string, mapId: string, ticketId: string): RuleWaiver[] {
    try {
      return machineStore(root).read<Waivers>(FILE)?.[keyOf(mapId, ticketId)] ?? [];
    } catch {
      return [];
    }
  },

  /** Adds a waiver under the file's lock; a config dir this process can't write refuses it. */
  add(root: string, w: RuleWaiver) {
    try {
      const store = machineStore(root);
      mkdirSync(store.dir, { recursive: true, mode: 0o700 });
      withFileLock(store.file(`${FILE}.lock`), () => {
        const all = store.read<Waivers>(FILE) ?? {};
        const key = keyOf(w.mapId, w.ticketId);
        all[key] = [...(all[key] ?? []).filter((x) => x.rule !== w.rule), w];
        store.write(FILE, all);
      });
    } catch (e) {
      throw new OperationError(
        `Couldn't keep it in Teamtrail's config folder on this machine: ${(e as Error).message}`,
      );
    }
  },
};
