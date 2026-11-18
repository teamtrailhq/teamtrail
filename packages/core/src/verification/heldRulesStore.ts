import { rmSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { HeldRules } from '../model/diffRule';
import { EVIDENCE_DIR, evidencePaths } from './evidenceStore';

/*
 * The rules a ticket's latest completion was refused for, local and git-ignored like the rest of the evidence:
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/rules-held.json
 * It only tells the Lookout what to offer (Go without a rule). What a completion needs is worked out again from the
 * approved rules and the changed files every time, so a file an agent wrote here lifts nothing.
 */
const file = (root: string, mapId: string, ticketId: string) =>
  path.join(root, evidencePaths.ticket(mapId, ticketId), 'rules-held.json');

export const heldRulesStore = {
  read(root: string, mapId: string, ticketId: string): HeldRules | undefined {
    const r = readJsonFile<HeldRules>(file(root, mapId, ticketId));
    return r?.v === 1 && Array.isArray(r.rules) ? r : undefined;
  },

  write(root: string, mapId: string, ticketId: string, held: HeldRules) {
    ensureLocalDir(path.join(root, EVIDENCE_DIR));
    writeJsonAtomic(file(root, mapId, ticketId), held);
  },

  clear(root: string, mapId: string, ticketId: string) {
    rmSync(file(root, mapId, ticketId), { force: true });
  },
};
