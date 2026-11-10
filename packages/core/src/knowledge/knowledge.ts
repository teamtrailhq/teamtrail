import { wildcardMatch } from '../model/wildcard';

/**
 * Project knowledge: what agents need to know about this codebase and product, kept as reviewed entries.
 * Agents propose (always `suggested`); only the trail lead confirms, keeps as an assumption, edits or retires.
 * Stored as `<tracker dir>/knowledge/<id>.md`, committed, so teammates share it through git.
 */
export type KnowledgeKind =
  | 'architecture'
  | 'convention'
  | 'gotcha'
  | 'dead-end'
  | 'glossary'
  | 'fact'
  | 'business-rule'
  | 'product-decision'
  | 'persona'
  | 'ux-principle'
  | 'pricing';

export const ENGINEERING_KINDS: KnowledgeKind[] = [
  'architecture',
  'convention',
  'gotcha',
  'dead-end',
  'glossary',
  'fact',
];
export const PRODUCT_KINDS: KnowledgeKind[] = [
  'business-rule',
  'product-decision',
  'persona',
  'ux-principle',
  'pricing',
];
export const KNOWLEDGE_KINDS: KnowledgeKind[] = [...ENGINEERING_KINDS, ...PRODUCT_KINDS];

/** `suggested`: proposed, not reviewed · `confirmed`: fact · `assumption`: accepted, unverified · `outdated`: retired. */
export type KnowledgeStatus = 'suggested' | 'confirmed' | 'assumption' | 'outdated';
export const KNOWLEDGE_STATUSES: KnowledgeStatus[] = ['suggested', 'confirmed', 'assumption', 'outdated'];

/** A file the entry is about, with its git blob hash when the entry was confirmed (see staleness). */
export interface KnowledgeAnchor {
  path: string;
  hash?: string;
}

export interface KnowledgeEntry {
  /** `K-<n>`. */
  id: string;
  title: string;
  body: string;
  kind: KnowledgeKind;
  status: KnowledgeStatus;
  /** Path globs the entry applies to, e.g. `src/notify/**`. */
  scope: string[];
  tags: string[];
  /** Where it came from: `trail:#1`, `ticket:#4`, `decision:D-3`, `brief:#1`, `session:s_…`, `import:spec.md`. */
  sources: string[];
  anchors: KnowledgeAnchor[];
  /** Agent trail name or `trail lead`. */
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  /** An agent's report that it may be outdated, until the trail lead resolves it. */
  flag?: { by: string; reason: string; at: number };
}

export const KNOWLEDGE_DIR = 'knowledge';

export const isKind = (v: unknown): v is KnowledgeKind => KNOWLEDGE_KINDS.includes(v as KnowledgeKind);

/** Entries agents get: confirmed facts and accepted assumptions. Suggestions and retired entries never reach them. */
export const isLive = (e: Pick<KnowledgeEntry, 'status'>) => e.status === 'confirmed' || e.status === 'assumption';

/** The trail lead's calls. Agents can only propose and flag. */
export type KnowledgeCall =
  | { kind: 'confirm' }
  | { kind: 'assumption' }
  | { kind: 'outdated' }
  | { kind: 'resolve-flag' }
  | { kind: 'edit'; title?: string; body?: string; scope?: string[]; tags?: string[]; entryKind?: KnowledgeKind };

export function applyCall(e: KnowledgeEntry, call: KnowledgeCall, now = Date.now()): KnowledgeEntry {
  const next = { ...e, updatedAt: now };
  switch (call.kind) {
    case 'confirm':
      return { ...next, status: 'confirmed', flag: undefined };
    case 'assumption':
      return { ...next, status: 'assumption', flag: undefined };
    case 'outdated':
      return { ...next, status: 'outdated', flag: undefined };
    case 'resolve-flag':
      return { ...next, flag: undefined };
    case 'edit':
      return {
        ...next,
        title: call.title?.trim() || e.title,
        body: call.body ?? e.body,
        scope: call.scope ?? e.scope,
        tags: call.tags ?? e.tags,
        kind: call.entryKind ?? e.kind,
      };
  }
}

const words = (s: string) => s.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? [];

/**
 * `src/notify/**` style globs: `**` followed by a slash matches whole folders (or none), so `**` + `/migrations/**`
 * never matches `foomigrations/`; a bare `**` matches anything; `*` stays within one segment; `?` is one
 * character of a segment. Linear time in the glob and the path (model/wildcard.ts): globs come from agents.
 */
export function globMatch(glob: string, path: string) {
  return wildcardMatch(glob, path.replace(/^\.\//, ''), { segments: true });
}

/** Search for agents: tokens in title/body/tags, path globs, tags. Deterministic; ties break by id. */
export function searchKnowledge(
  entries: KnowledgeEntry[],
  q: { query?: string; paths?: string[]; tags?: string[]; kind?: KnowledgeKind; includeOutdated?: boolean },
) {
  const terms = new Set(words(q.query ?? ''));
  const tags = new Set((q.tags ?? []).map((t) => t.toLowerCase()));
  return entries
    .filter((e) => (q.includeOutdated || e.status !== 'outdated') && (!q.kind || e.kind === q.kind))
    .map((e) => {
      const text = new Set(words(`${e.title} ${e.body} ${e.tags.join(' ')}`));
      const hits = [...terms].filter((t) => text.has(t)).length;
      const tagHits = e.tags.filter((t) => tags.has(t.toLowerCase())).length;
      const pathHits = (q.paths ?? []).filter((p) => e.scope.some((g) => globMatch(g, p))).length;
      return { e, score: hits + 2 * tagHits + 3 * pathHits };
    })
    .filter((x) => x.score > 0 || (!terms.size && !tags.size && !q.paths?.length))
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id, undefined, { numeric: true }))
    .map((x) => x.e);
}

/** Splits a markdown document into suggested entries, one per `##` heading (seeding from an existing spec). */
export function splitForImport(md: string, source: string) {
  return md
    .split(/^##\s+/m)
    .slice(1)
    .map((part) => {
      const nl = part.indexOf('\n');
      return {
        title: part.slice(0, nl === -1 ? undefined : nl).trim(),
        body: nl === -1 ? '' : part.slice(nl + 1).trim(),
      };
    })
    .filter((x) => x.title && x.body)
    .map((x) => ({ ...x, sources: [`import:${source}`] }));
}
