import type { IncomingMessage, ServerResponse } from 'node:http';
import { applyCall, isKind, type KnowledgeCall, type KnowledgeEntry } from '../knowledge/knowledge';
import {
  blobHash,
  listKnowledge,
  nextKnowledgeId,
  readKnowledge,
  repoRootFor,
  writeKnowledge,
} from '../knowledge/knowledgeStore';
import { staleAnchors, withCurrentHashes } from '../knowledge/staleness';
import { contentHash } from '../lib/contentHash';
import { BadRequest, readJson, sendJson } from './http';
import { matchesShown } from './shownContent';

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x) : []);
const CALLS = new Set(['confirm', 'assumption', 'outdated', 'resolve-flag', 'edit']);

/** What the trail lead reads of an entry before confirming it: what agents will be given as fact. */
const shownOf = (e: KnowledgeEntry) => ({
  title: e.title,
  body: e.body,
  kind: e.kind,
  scope: e.scope,
  tags: e.tags,
  anchors: e.anchors.map((a) => a.path),
});

/**
 * `/knowledge` routes over the entries under `root`; false when none matches. GET lists them with the anchored
 * files that changed since each was confirmed; POST `/knowledge/propose` adds a suggestion (promote actions);
 * POST `/knowledge/call` is the trail lead's confirm, assumption, outdated, resolve-flag or edit; confirm and
 * assumption carry `hash` (from GET's `hashes`) of the entry shown, and an entry that changed since gets a 409.
 */
export async function handleKnowledge(root: string, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!url.pathname.startsWith('/knowledge')) return false;
  const repo = repoRootFor(root);
  const hashOf = (p: string) => blobHash(repo, p);
  if (url.pathname === '/knowledge' && req.method === 'GET') {
    const entries = listKnowledge(root);
    const stale = Object.fromEntries(entries.map((e) => [e.id, staleAnchors(e, hashOf)]).filter(([, p]) => p.length));
    const hashes = Object.fromEntries(entries.map((e) => [e.id, contentHash(shownOf(e))]));
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
  if (url.pathname === '/knowledge/call') return (callOn(root, res, b), true);
  return false;
}

/** The trail lead's call on an entry; confirm and assumption only on the entry as they were shown it. */
function callOn(root: string, res: ServerResponse, b: Record<string, unknown>) {
  const call = b.call as KnowledgeCall | undefined;
  if (typeof b.id !== 'string' || !call || !CALLS.has(call.kind))
    throw new BadRequest('"id" and a valid "call" are required');
  const e = readKnowledge(root, b.id);
  if (!e) return sendJson(res, 404, { error: `no knowledge entry ${b.id}` });
  const vouches = call.kind === 'confirm' || call.kind === 'assumption';
  if (vouches && !matchesShown(res, { given: b.hash, now: shownOf(e), what: 'This entry' })) return;
  let next = applyCall(e, call);
  const repo = repoRootFor(root);
  if (vouches || call.kind === 'edit') next = withCurrentHashes(next, (p) => blobHash(repo, p));
  writeKnowledge(root, next);
  sendJson(res, 200, { entry: next });
}
