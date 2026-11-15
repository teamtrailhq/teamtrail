import type { DecisionRecord } from '../model/types';

/** One decision's place in the team's memory: the area it is about, and how often later decisions lean on it. */
export interface DecisionMemoryEntry {
  /** A folder (`src/pricing/`), else its risk category, else `No area yet`. */
  area: string;
  /** Later decisions that name it (`D-2` in their question, answer, summary or rationale) or replace it. */
  citedBy: string[];
}

export const NO_AREA = 'No area yet';

/** The folder most of the files share: the first two segments of the most common one. */
function folderOf(files: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const f of files) {
    const folders = f.split('/').slice(0, -1).slice(0, 2);
    const dir = folders.length ? `${folders.join('/')}/` : '/';
    counts.set(dir, (counts.get(dir) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
}

const mentions = (d: DecisionRecord, id: string) =>
  new RegExp(`(^|[^\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`).test(
    [d.question, d.answer, d.summary, d.rationale].join('\n'),
  );

/**
 * Each decision's area and the decisions that cite it, keyed `<mapId>/<id>`. Pure and deterministic: areas come from
 * the files the decision's ticket changed in verified work (precedentAreas.ts), citations from the records' own text.
 */
export function decisionMemory(decisions: DecisionRecord[], areas: Map<string, string[]>) {
  const out = new Map<string, DecisionMemoryEntry>();
  for (const d of decisions) {
    const key = `${d.mapId}/${d.id}`;
    const area = folderOf(areas.get(key) ?? []) ?? d.risk?.category ?? NO_AREA;
    const citedBy = decisions
      .filter((o) => o !== d && o.decidedAt >= d.decidedAt && (o.supersedes === d.id || mentions(o, d.id)))
      .map((o) => o.id);
    out.set(key, { area, citedBy: [...new Set(citedBy)] });
  }
  return out;
}
