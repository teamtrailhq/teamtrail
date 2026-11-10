import { rmSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import { CRITERIA_DIR, type CriteriaProposal } from './criteria';

interface ProposalFile {
  v: 1;
  proposals: CriteriaProposal[];
}

/*
 * Kept in `<tracker dir>/criteria/<mapId>.proposed.json`, next to the criteria, and removed once decided.
 */
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const file = (root: string, mapId: string) => path.join(root, CRITERIA_DIR, `${safe(mapId)}.proposed.json`);

const isProposal = (p: Partial<CriteriaProposal> | undefined): p is CriteriaProposal =>
  !!p && typeof p.ticketId === 'string' && typeof p.by === 'string' && Array.isArray(p.criteria);

/** The proposals waiting on a trail. */
export function readCriteriaProposals(root: string, mapId: string): CriteriaProposal[] {
  const f = readJsonFile<ProposalFile>(file(root, mapId));
  return f?.v === 1 && Array.isArray(f.proposals) ? f.proposals.filter(isProposal) : [];
}

function save(root: string, mapId: string, proposals: CriteriaProposal[]) {
  if (proposals.length) writeJsonAtomic(file(root, mapId), { v: 1, proposals } satisfies ProposalFile);
  else rmSync(file(root, mapId), { force: true });
}

/** Keeps `p` as the ticket's proposal, replacing an earlier one. */
export function writeCriteriaProposal(root: string, mapId: string, p: CriteriaProposal) {
  save(root, mapId, [...readCriteriaProposals(root, mapId).filter((x) => x.ticketId !== p.ticketId), p]);
  return p;
}

/** Removes the ticket's proposal (taken or dismissed); returns it when there was one. */
export function dropCriteriaProposal(root: string, mapId: string, ticketId: string) {
  const all = readCriteriaProposals(root, mapId);
  const found = all.find((x) => x.ticketId === ticketId);
  if (found) save(root, mapId, all.filter((x) => x !== found));
  return found;
}
