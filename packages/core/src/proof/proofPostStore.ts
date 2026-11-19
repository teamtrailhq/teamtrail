import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { ensureLocalDir } from '../lib/ensureLocalDir';
import { readJsonFile, writeJsonAtomic } from '../lib/jsonFile';
import type { ProofPostRecord } from '../model/proofPost';
import { EVIDENCE_DIR, evidencePaths } from '../verification/evidenceStore';

/*
 * What this machine last posted for a ticket's proof, local and git-ignored like the rest of the evidence:
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/proof-post.json
 * It only saves posting the same proof twice. The comment itself is found again by its marker, never by an id
 * kept here, so a file an agent wrote can't point Teamtrail at someone else's comment.
 */
const file = (root: string, mapId: string, ticketId: string) =>
  path.join(root, evidencePaths.ticket(mapId, ticketId), 'proof-post.json');

export function readProofPost(root: string, mapId: string, ticketId: string) {
  const r = readJsonFile<ProofPostRecord>(file(root, mapId, ticketId));
  return r?.v === 1 ? r : undefined;
}

export function writeProofPost(root: string, r: ProofPostRecord) {
  ensureLocalDir(path.join(root, EVIDENCE_DIR));
  writeJsonAtomic(file(root, r.mapId, r.ticketId), r);
}

export function dropProofPost(root: string, mapId: string, ticketId: string) {
  rmSync(file(root, mapId, ticketId), { force: true });
}

/** Every ticket's post record, in every trail's evidence folder, each read from its own ticket's folder only. */
export function readProofPosts(root: string): ProofPostRecord[] {
  const dirs = (dir: string) => {
    try {
      return readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory());
    } catch {
      return [];
    }
  };
  const base = path.join(root, EVIDENCE_DIR);
  const out: ProofPostRecord[] = [];
  for (const m of dirs(base))
    for (const t of dirs(path.join(base, m.name))) {
      const r = readJsonFile<ProofPostRecord>(path.join(base, m.name, t.name, 'proof-post.json'));
      const here = `${EVIDENCE_DIR}/${m.name}/${t.name}`;
      // only a record in its own ticket's folder: one can't speak for another ticket
      if (
        r?.v === 1 &&
        typeof r.mapId === 'string' &&
        typeof r.ticketId === 'string' &&
        evidencePaths.ticket(r.mapId, r.ticketId) === here
      )
        out.push(r);
    }
  return out;
}
