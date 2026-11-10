import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { contentHash, trustKey, trustLedger } from '../trust/trustLedger';
import { isLive, KNOWLEDGE_DIR, type KnowledgeEntry } from './knowledge';
import { parseKnowledge, serializeKnowledge } from './knowledgeFile';

const dir = (root: string) => path.join(root, KNOWLEDGE_DIR);

export function listKnowledgeFiles(root: string): KnowledgeEntry[] {
  if (!existsSync(dir(root))) return [];
  return readdirSync(dir(root))
    .filter((n) => /^K-\d+\.md$/.test(n))
    .map((n) => {
      try {
        return parseKnowledge(n.slice(0, -3), readFileSync(path.join(dir(root), n), 'utf8'));
      } catch {
        return undefined;
      }
    })
    .filter((e): e is KnowledgeEntry => !!e)
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** What the trail lead's call on an entry covers: what agents are handed, and the status it is handed with. */
export function knowledgeContent(e: KnowledgeEntry) {
  const scope = e.scope.length ? [`scope: ${e.scope.join(', ')}`] : [];
  const tags = e.tags.length ? [`tags: ${e.tags.join(', ')}`] : [];
  return [`${e.status} ${e.kind}: ${e.title}`, ...scope, ...tags, '', e.body].join('\n');
}

/**
 * The entries as this machine trusts them. The files are committed, so anyone who can write the repo can mark an
 * entry confirmed, and confirmed entries are handed to agents as binding. A live status counts only for the content
 * the trail lead made that call on, here (trust/trustLedger.ts). Otherwise the entry reads as suggested, with
 * `approval` saying why. That holds for a teammate's confirmation too: it is shown as theirs and asked for once.
 */
export function listKnowledge(root: string): KnowledgeEntry[] {
  const all = listKnowledgeFiles(root);
  if (!all.some(isLive)) return all;
  const ledger = trustLedger(root);
  return all.map((e) => {
    if (!isLive(e)) return e;
    const standing = ledger.standing(trustKey.knowledge(e.id), contentHash(knowledgeContent(e)));
    if (standing === 'approved') return e;
    return { ...e, status: 'suggested', approval: { standing, claimed: e.status } };
  });
}

/** Records the trail lead's call on `e`, the entry as their call left it; an entry that is no longer live is forgotten. */
export function approveKnowledgeHere(root: string, e: KnowledgeEntry, by: string) {
  const ledger = trustLedger(root);
  if (!isLive(e)) return ledger.drop(trustKey.knowledge(e.id));
  const content = knowledgeContent(e);
  ledger.set({ [trustKey.knowledge(e.id)]: { hash: contentHash(content), at: Date.now(), by, content } });
}

export const readKnowledge = (root: string, id: string) => listKnowledge(root).find((e) => e.id === id);

export function writeKnowledge(root: string, e: KnowledgeEntry) {
  mkdirSync(dir(root), { recursive: true });
  // an entry read as suggested because this machine hasn't approved it keeps the status its file has
  const { approval, ...entry } = e;
  const kept = approval ? { ...entry, status: approval.claimed } : entry;
  writeFileSync(path.join(dir(root), `${e.id}.md`), serializeKnowledge(kept));
}

/**
 * Writes a new entry under the next free `K-<n>`, with an exclusive create: two agents proposing at once never
 * overwrite each other, the second takes the number after. Returns the entry with its id.
 */
export function createKnowledge(root: string, draft: Omit<KnowledgeEntry, 'id'>): KnowledgeEntry {
  mkdirSync(dir(root), { recursive: true });
  // A file another process is still writing doesn't parse yet, so the next free number may be taken: step past it.
  const first = Number(nextKnowledgeId(root).slice(2));
  for (let n = first; n < first + 50; n++) {
    const entry = { ...draft, id: `K-${n}` };
    try {
      writeFileSync(path.join(dir(root), `${entry.id}.md`), serializeKnowledge(entry), { flag: 'wx' });
      return entry;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  throw new Error('could not allocate a knowledge id');
}

/** The next free `K-<n>`. */
export function nextKnowledgeId(root: string) {
  const n = Math.max(0, ...listKnowledge(root).map((e) => Number(e.id.slice(2)) || 0));
  return `K-${n + 1}`;
}

/** Git's blob hash of a file in the repo (no git needed); undefined when the file is missing or outside the repo. */
export function blobHash(repo: string, file: string) {
  const top = path.resolve(repo);
  const abs = path.resolve(top, file);
  // Anchors come from agents: one that points outside the repo is never read.
  if (!abs.startsWith(top + path.sep) || !existsSync(abs)) return undefined;
  const content = readFileSync(abs);
  return createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
}

/** The repo a tracker folder belongs to: the nearest parent with `.git`, else the folder's parent. */
export function repoRootFor(root: string) {
  for (let d = path.resolve(root); ; d = path.dirname(d)) {
    if (existsSync(path.join(d, '.git'))) return d;
    if (path.dirname(d) === d) return path.dirname(path.resolve(root));
  }
}
