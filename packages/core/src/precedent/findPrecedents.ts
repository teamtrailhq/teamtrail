import type { Precedent, PrecedentQuery } from '../model/precedent';
import type { DecisionRecord } from '../model/types';
import { globsOverlap } from '../workspaces/touches';
import { wordOverlap } from './wordOverlap';

/** How similar two questions' wording must be (share of their words) before one is suggested for the other. */
export const SIMILAR_WORDING = 0.5;
const MAX = 5;

const dir = (p: string) => p.replace(/\/[^/]*$/, '/');

/** The query's paths that touch the decision's area: the same file or glob, or a file in the same folder. */
function sharedArea(paths: string[], area: string[]) {
  const hits = paths.filter((p) => area.some((f) => globsOverlap(p, f) || (p.includes('/') && dir(p) === dir(f))));
  return [...new Set(hits)];
}

function reasonsFor(d: DecisionRecord, q: PrecedentQuery, area: string[]) {
  const strong: string[] = [];
  const weak: string[] = [];
  const category = d.risk?.category;
  const sameCategory = !!category && !!q.categories?.includes(category);
  const wording = wordOverlap(q.text, `${d.question} ${d.summary}`);
  const similar = wording >= SIMILAR_WORDING;
  if (q.relatesTo?.includes(d.id)) strong.push(`you named ${d.id}`);
  const sameTicket = !!q.ticketId && d.ticketId === q.ticketId;
  if (sameTicket && (sameCategory || similar))
    strong.push(sameCategory ? `decided on this ticket, also ${category}` : 'decided on this ticket, in similar words');
  else if (sameTicket) weak.push('decided on this ticket');
  const files = sharedArea(q.paths ?? [], area);
  if (files.length && sameCategory) strong.push(`${category}, and it touches ${files.slice(0, 3).join(', ')}`);
  else if (files.length) weak.push(`it touches ${files.slice(0, 3).join(', ')}`);
  const assumptions = (q.assumes ?? []).filter((s) => d.assumes?.includes(s));
  if (assumptions.length) weak.push(`relies on ${assumptions.join(', ')} too`);
  if (similar) weak.push(`similar wording (${Math.round(wording * 100)}% of words shared)`);
  return { strong, weak };
}

/**
 * The decisions already made that may answer a question, strongest first, then newest; at most five. Deterministic
 * and explained: a match is strong only for the same ticket or files and the same risk category, or when the agent
 * names the decision. Superseded decisions are never returned. `areas` holds the files each decision's ticket
 * changed in its verified work (precedentAreas.ts).
 */
export function findPrecedents(o: {
  query: PrecedentQuery;
  decisions: DecisionRecord[];
  areas?: Map<string, string[]>;
}): Precedent[] {
  return o.decisions
    .filter((d) => !d.supersededBy)
    .flatMap((d) => {
      const { strong, weak } = reasonsFor(d, o.query, o.areas?.get(`${d.mapId}/${d.id}`) ?? []);
      if (!strong.length && !weak.length) return [];
      const strength = strong.length ? ('strong' as const) : ('suggested' as const);
      return [
        {
          id: d.id,
          mapId: d.mapId,
          ticketKey: d.ticketKey,
          question: d.question,
          summary: d.summary,
          answer: d.answer,
          decidedBy: d.decidedBy,
          decidedAt: d.decidedAt,
          strength,
          reasons: [...strong, ...weak],
        },
      ];
    })
    .sort((a, b) => Number(b.strength === 'strong') - Number(a.strength === 'strong') || b.decidedAt - a.decidedAt)
    .slice(0, MAX);
}
