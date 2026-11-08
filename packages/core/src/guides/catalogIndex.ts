import type { CatalogEntry, CatalogIndex } from '../model/guide';
import { ALL_TICKET_TYPES, type TicketType } from '../model/types';

const isStr = (v: unknown): v is string => typeof v === 'string';
/** A path inside the catalog: relative, no `..`, a markdown file. */
const safePath = (p: string) => /^[\w./-]+\.md$/.test(p) && !p.startsWith('/') && !p.split('/').includes('..');

function entryOf(e: Record<string, unknown>): CatalogEntry | undefined {
  if (![e.id, e.version, e.path, e.sha256, e.summary, e.author].every(isStr)) return undefined;
  if (!safePath(e.path as string) || !/^sha256:[0-9a-f]{64}$/.test(e.sha256 as string)) return undefined;
  const history = Array.isArray(e.history) ? e.history.filter((h) => h && isStr(h.version) && isStr(h.commit)) : [];
  const types = Array.isArray(e.types) ? e.types.filter((t) => (ALL_TICKET_TYPES as unknown[]).includes(t)) : [];
  return {
    id: e.id as string,
    version: e.version as string,
    path: e.path as string,
    sha256: e.sha256 as string,
    ...(isStr(e.name) ? { name: e.name } : {}),
    summary: e.summary as string,
    author: e.author as string,
    verified: e.verified === true,
    reviewedBy: Array.isArray(e.reviewedBy) ? e.reviewedBy.filter(isStr) : [],
    history,
    ...(e.reported === true ? { reported: true } : {}),
    ...(e.builtin === true ? { builtin: true } : {}),
    ...(types.length ? { types: types as TicketType[] } : {}),
  };
}

/** A catalog's `index.json`; entries that don't validate are left out rather than trusted. */
export function parseCatalogIndex(raw: unknown): CatalogIndex | undefined {
  const r = raw as { v?: unknown; repo?: unknown; guides?: unknown };
  if (!r || r.v !== 1 || !Array.isArray(r.guides)) return undefined;
  const guides = r.guides.map((e) => entryOf((e ?? {}) as Record<string, unknown>)).filter((e) => !!e);
  const repo = isStr(r.repo) && /^https:\/\//.test(r.repo) ? { repo: r.repo } : {};
  return { v: 1, ...repo, guides };
}

/** Entries matching every word of `query` (id, name, summary, author), optionally verified (or built-in) only. */
export function searchCatalog(index: CatalogIndex, opts: { query?: string; verifiedOnly?: boolean } = {}) {
  const words = (opts.query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  return index.guides.filter((e) => {
    // built-in copies ship with Teamtrail, so they count as reviewed
    if (opts.verifiedOnly && !e.verified && !e.builtin) return false;
    const hay = [e.id, e.name ?? '', e.summary, e.author].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
