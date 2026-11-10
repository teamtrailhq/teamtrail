import { globMatch, isLive, PRODUCT_KINDS, type KnowledgeEntry, type KnowledgeKind } from './knowledge';

export interface KnowledgeContext {
  /** `#12`: entries from this trail rank higher. */
  trailKey?: string;
  ticket?: { type: string; title: string; body: string };
  /** Paths the work touches: from the ticket and the discovery brief. */
  paths: string[];
  tags?: string[];
  /** The discovery ticket: product knowledge first. */
  discovery?: boolean;
}

export interface SelectedKnowledge {
  id: string;
  title: string;
  kind: KnowledgeKind;
  status: 'confirmed' | 'assumption';
  body: string;
  /** Why it was picked, e.g. "path match src/notify/** (src/notify/service.ts)". */
  why: string[];
  /** Anchored files changed since it was confirmed: treat with care, and flag it if it's wrong. */
  mayBeOutdated?: string[];
  flagged?: string;
}

const WEIGHT: Partial<Record<KnowledgeKind, number>> = {
  'business-rule': 3,
  convention: 3,
  'product-decision': 2,
  architecture: 2,
  gotcha: 2,
  'dead-end': 2,
  'ux-principle': 2,
};
/** Rules that hold everywhere: picked even without a match. */
const ALWAYS: KnowledgeKind[] = ['business-rule', 'ux-principle', 'convention'];
const MAX_BODY = 600;

/**
 * A flag's reason is an agent's words, not reviewed by anyone: other agents learn that an entry was flagged and by
 * whom, never what the flag says.
 */
export const flaggedNote = (by: string) => `flagged as possibly outdated by ${by}; the human is reviewing it`;

/** Filler words never count as a match. */
const STOP = new Set(
  'the and for with from into onto that this these those than then through use uses using via all any are was were will can should must not only also each when what where which who how per our your their its'.split(
    ' ',
  ),
);
const words = (s: string) =>
  new Set((s.toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) ?? []).filter((w) => !STOP.has(w)));

/**
 * The knowledge an agent gets with a ticket: live entries only, ranked by path, words, trail and kind, within
 * `budget` characters of body. Deterministic: same entries and context, same picks and order.
 */
export function selectKnowledge(
  entries: KnowledgeEntry[],
  ctx: KnowledgeContext,
  budget = 4000,
  staleOf: (e: KnowledgeEntry) => string[] = () => [],
): SelectedKnowledge[] {
  const ticketWords = ctx.ticket ? words(`${ctx.ticket.title} ${ctx.ticket.body}`) : new Set<string>();
  const tags = new Set((ctx.tags ?? []).map((t) => t.toLowerCase()));
  const ranked = entries
    .filter(isLive)
    .map((e) => {
      const why: string[] = [];
      let score = WEIGHT[e.kind] ?? 1;
      for (const g of e.scope) {
        const hit = ctx.paths.find((p) => globMatch(g, p));
        if (hit) {
          score += 6;
          why.push(`path match ${g} (${hit})`);
          break;
        }
      }
      const tagHits = e.tags.filter((t) => tags.has(t.toLowerCase()) || ticketWords.has(t.toLowerCase()));
      if (tagHits.length) {
        score += 3 * tagHits.length;
        why.push(`tag ${tagHits.join(', ')}`);
      }
      const titleHits = [...words(e.title)].filter((w) => ticketWords.has(w));
      if (titleHits.length) {
        score += titleHits.length;
        why.push(`mentions ${titleHits.slice(0, 3).join(', ')}`);
      }
      if (ctx.trailKey && e.sources.includes(`trail:${ctx.trailKey}`)) {
        score += 3;
        why.push('same trail');
      }
      if (ctx.discovery && PRODUCT_KINDS.includes(e.kind)) {
        score += 8;
        why.push('product context for discovery');
      }
      if (!why.length && ALWAYS.includes(e.kind) && !e.scope.length)
        why.push(`${e.kind.replace('-', ' ')} for the whole project`);
      return { e, score, why };
    })
    .filter((x) => x.why.length > 0)
    .sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id, undefined, { numeric: true }));
  const out: SelectedKnowledge[] = [];
  let used = 0;
  for (const { e, why } of ranked) {
    const body = e.body.length > MAX_BODY ? `${e.body.slice(0, MAX_BODY)}…` : e.body;
    if (used + body.length > budget && out.length) break;
    used += body.length;
    const stale = staleOf(e);
    out.push({
      id: e.id,
      title: e.title,
      kind: e.kind,
      status: e.status as 'confirmed' | 'assumption',
      body,
      why,
      ...(stale.length ? { mayBeOutdated: stale } : {}),
      ...(e.flag ? { flagged: flaggedNote(e.flag.by) } : {}),
    });
  }
  return out;
}
