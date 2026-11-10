import { rmSync } from 'node:fs';
import path from 'node:path';
import { AGENTS_DIR } from '../agents/agentLink';
import { ignoreAgentsDir } from '../agents/ignoreAgentsDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { CriteriaProposal } from './criteria';

interface ProposalFile {
  v: 1;
  proposals: CriteriaProposal[];
}

/*
 * Kept on this machine, out of git (an agent's proposal is not the project's criteria), and removed once decided:
 *   <tracker dir>/.agents/criteria-proposals/<mapId>.json
 */
const safe = (s: string) => s.replace(/[^\w.-]/g, '_');
const file = (root: string, mapId: string) => path.join(root, AGENTS_DIR, 'criteria-proposals', `${safe(mapId)}.json`);

const isProposal = (p: Partial<CriteriaProposal> | undefined): p is CriteriaProposal =>
  !!p && typeof p.ticketId === 'string' && typeof p.by === 'string' && Array.isArray(p.criteria);

/** The proposals waiting on a trail. */
export function readCriteriaProposals(root: string, mapId: string): CriteriaProposal[] {
  const f = readJsonFile<ProposalFile>(file(root, mapId));
  return f?.v === 1 && Array.isArray(f.proposals) ? f.proposals.filter(isProposal) : [];
}

function save(root: string, mapId: string, proposals: CriteriaProposal[]) {
  ignoreAgentsDir(root);
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
  if (found)
    save(
      root,
      mapId,
      all.filter((x) => x !== found),
    );
  return found;
}
