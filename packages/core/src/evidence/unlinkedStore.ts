import { rmSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { EVIDENCE_DIR, evidencePaths } from '../verification/evidenceStore';

/*
 * The pull requests the trail lead unlinked from a ticket by hand, local and git-ignored like the rest of the evidence:
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/pr-unlinked.json   `{ v: 1, prs: number[] }`
 * The reconciler never links one of them again by branch, marker or attempt (findLink.ts); only a hand link does,
 * and it takes that PR off the list.
 */
interface UnlinkedFile {
  v: 1;
  prs: number[];
}

const file = (root: string, mapId: string, ticketId: string) =>
  path.join(root, evidencePaths.ticket(mapId, ticketId), 'pr-unlinked.json');

const isPr = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0;

export function readUnlinked(root: string, mapId: string, ticketId: string): number[] {
  const f = readJsonFile<UnlinkedFile>(file(root, mapId, ticketId));
  return f?.v === 1 && Array.isArray(f.prs) ? f.prs.filter(isPr) : [];
}

/** Replaces the ticket's list; an empty one removes the file. */
export function writeUnlinked(root: string, at: { mapId: string; ticketId: string }, prs: number[]) {
  const f = file(root, at.mapId, at.ticketId);
  if (!prs.length) return rmSync(f, { force: true });
  ensureLocalDir(path.join(root, EVIDENCE_DIR));
  writeJsonAtomic(f, { v: 1, prs: [...new Set(prs)].sort((a, b) => a - b) } satisfies UnlinkedFile);
}
