import { mkdirSync } from 'node:fs';
import { machineStore } from '../machine/machineStore';
import { withFileLock } from '../machine/withFileLock';
import type { MergeAcceptance } from '../model/mergeAnyway';
import type { Proof } from '../model/proof';
import { OperationError } from '../planning/operations/operationError';
import { gapsHash } from './gapsHash';

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

  /**
   * The ticket's latest, when it accepted exactly these gaps at this head (`gapsHash`): what a server that merges asks,
   * with the hash the page sent it. Given the ticket's `proof` as it is now, the record must also still be about it:
   * the same gaps, and the proof's commit, or, when the proof names none, a head accepted as the pull request's
   * (`atPrHead`). Its `head` is then the only one a merge may take.
   */
  covering(
    root: string,
    o: { mapId: string; ticketId: string; gapsHash: string; proof?: Pick<Proof, 'gaps' | 'git'> },
  ): MergeAcceptance | undefined {
    const a = mergeAcceptances.latest(root, o.mapId, o.ticketId);
    if (a?.gapsHash !== o.gapsHash) return undefined;
    return !o.proof || stillCovers(a, o.proof) ? a : undefined;
  },
};

/** The record is about the proof as it is now: its gaps, its commit or the pull request's head, its own hash. */
function stillCovers(a: MergeAcceptance, proof: Pick<Proof, 'gaps' | 'git'>): boolean {
  const own = proof.git?.head;
  const head = own ? a.head === own && !a.atPrHead : a.atPrHead === true;
  const gaps = JSON.stringify(a.gaps) === JSON.stringify(proof.gaps);
  return head && gaps && gapsHash({ head: a.head, gaps: a.gaps }) === a.gapsHash;
}
