import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyCall, isKind, type KnowledgeCall, type KnowledgeEntry } from '../knowledge/knowledge';
import {
  blobHash,
  listKnowledge,
  nextKnowledgeId,
  readKnowledge,
  repoRootFor,
  writeKnowledge,
  approveKnowledgeHere,
  knowledgeContent,
  listKnowledgeFiles,
} from '../knowledge/knowledgeStore';
import { staleAnchors, withCurrentHashes } from '../knowledge/staleness';
import { contentHash } from '../trust/trustLedger';
import { BadRequest, readJson, sendJson } from './http';
import { checkShown } from './shownHash';

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
const CALLS = new Set(['confirm', 'assumption', 'outdated', 'resolve-flag', 'edit']);

/**
 * `/knowledge` routes over the entries under `root`; false when none matches. GET lists them with the anchored
 * files that changed since each was confirmed; POST `/knowledge/propose` adds a suggestion (promote actions);
 * POST `/knowledge/call` (`id`, `call`, `hash`: the entry as the page showed it) is the trail lead's confirm,
 * assumption, outdated, resolve-flag or edit; a call on an entry that changed since is refused.
 */
export async function handleKnowledge(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!url.pathname.startsWith('/knowledge')) return false;
  const repo = repoRootFor(root);
  const hashOf = (p: string) => blobHash(repo, p);
  if (url.pathname === '/knowledge' && req.method === 'GET') {
    // `hashes`: each entry's file as the page shows it, by id; a call on an entry sends its hash back (shownHash.ts)
    const hashes = Object.fromEntries(listKnowledgeFiles(root).map((e) => [e.id, contentHash(knowledgeContent(e))]));
    const entries = listKnowledge(root);
    const stale = Object.fromEntries(entries.map((e) => [e.id, staleAnchors(e, hashOf)]).filter(([, p]) => p.length));
    sendJson(res, 200, { entries, stale, hashes });
    return true;
  }
  if (req.method !== 'POST') return false;
  const b = await readJson<Record<string, unknown>>(req, '{}');
  if (url.pathname === '/knowledge/propose') {
    if (typeof b.title !== 'string' || !b.title.trim() || typeof b.body !== 'string')
      throw new BadRequest('"title" and "body" are required');
    const now = Date.now();
    const entry: KnowledgeEntry = {
      id: nextKnowledgeId(root),
      title: b.title.trim().slice(0, 200),
      body: b.body.slice(0, 8000),
      kind: isKind(b.kind) ? b.kind : 'fact',
      status: 'suggested',
      scope: strings(b.scope),
      tags: strings(b.tags),
      sources: strings(b.sources),
      anchors: strings(b.anchors).map((p) => ({ path: p })),
      createdBy: 'trail lead',
      createdAt: now,
      updatedAt: now,
    };
    writeKnowledge(root, entry);
    sendJson(res, 200, { entry });
    return true;
  }
  if (url.pathname === '/knowledge/call')
    return (sendJson(res, ...(trailLeadCall(root, b, hashOf) as [number, unknown])), true);
  return false;
}

const SETTLES = new Set(['confirm', 'assumption', 'outdated']);

/**
 * The trail lead's call on an entry. The call that counts for agents is this machine's record of the entry's
 * content (knowledgeStore `approveKnowledgeHere`), not the status written to the file. A status call settles an entry
 * this machine hasn't approved; an edit or a resolved flag leaves such an entry waiting.
 */
function trailLeadCall(root: string, b: Record<string, unknown>, hashOf: (p: string) => string | undefined) {
  const call = b.call as KnowledgeCall | undefined;
  if (typeof b.id !== 'string' || !call || !CALLS.has(call.kind))
    throw new BadRequest('"id" and a valid "call" are required');
  const e = readKnowledge(root, b.id);
  if (!e) return [404, { error: `no knowledge entry ${b.id}` }];
  const onDisk = listKnowledgeFiles(root).find((x) => x.id === b.id);
  const shown = checkShown(b.hash, onDisk && knowledgeContent(onDisk), 'This entry');
  if (!shown.ok) return [shown.status, { error: shown.error }];
  let next = applyCall(e, call);
  if (call.kind === 'confirm' || call.kind === 'assumption' || call.kind === 'edit')
    next = withCurrentHashes(next, hashOf);
  const settles = SETTLES.has(call.kind);
  const written = settles ? { ...next, approval: undefined } : next;
  writeKnowledge(root, written);
  // what this machine trusts is the entry exactly as this call wrote it, not the file read back later
  if (!written.approval) approveKnowledgeHere(root, written, 'trail lead');
  return [200, { entry: readKnowledge(root, next.id) ?? next }];
}
