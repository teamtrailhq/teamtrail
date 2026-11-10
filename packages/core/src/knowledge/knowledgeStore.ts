import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { KNOWLEDGE_DIR, type KnowledgeEntry } from './knowledge';
import { parseKnowledge, serializeKnowledge } from './knowledgeFile';

const dir = (root: string) => path.join(root, KNOWLEDGE_DIR);

export function listKnowledge(root: string): KnowledgeEntry[] {
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

export const readKnowledge = (root: string, id: string) => listKnowledge(root).find((e) => e.id === id);

export function writeKnowledge(root: string, e: KnowledgeEntry) {
  mkdirSync(dir(root), { recursive: true });
  writeFileSync(path.join(dir(root), `${e.id}.md`), serializeKnowledge(e));
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
