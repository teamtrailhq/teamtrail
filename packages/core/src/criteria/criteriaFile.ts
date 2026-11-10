import { oneLine } from '../model/safeText';
import { isCriterionKind, type Criterion, type TicketCriteria } from './criteria';

/**
 * `criteria/<mapId>.md`: one `##` section per ticket, `## #12 · Build changelog search (id 12) · confirmed`, then one
 * line per criterion: `- AC-1 (unit) Search matches release titles` or `- AC-2 (business-rule, K-3) …`.
 */
export function serializeCriteria(title: string, tickets: TicketCriteria[]) {
  const parts = tickets
    .filter((t) => t.criteria.length)
    .map(
      (t) =>
        `## ${oneLine(t.ticketKey)} (id ${oneLine(t.ticketId)})${t.confirmed ? ' · confirmed' : ''}\n\n` +
        t.criteria.map(criterionLine).join('\n'),
    );
  return `# Acceptance criteria: ${title}\n\n${parts.join('\n\n')}\n`;
}

/**
 * One criterion, on one line whatever its text holds: a line break in it could otherwise start another ticket's
 * section, "· confirmed" included. A source that isn't a plain id is left out rather than written.
 */
function criterionLine(c: Criterion) {
  const source = c.source && /^[\w-]+$/.test(c.source) ? `, ${c.source}` : '';
  return `- ${c.id} (${c.kind}${source}) ${oneLine(c.text)}`;
}

const LINE = /^-\s+(AC-\d+)\s+\(([\w-]+)(?:,\s*([\w-]+))?\)\s+(.+)$/;
const HEAD = /^(.*?)\s+\(id ([^)]+)\)(\s+·\s+confirmed)?\s*$/;

export function parseCriteria(md: string): TicketCriteria[] {
  const out: TicketCriteria[] = [];
  for (const part of md.split(/^##\s+/m).slice(1)) {
    const nl = part.indexOf('\n');
    const head = HEAD.exec(part.slice(0, nl === -1 ? undefined : nl).trim());
    if (!head) continue;
    const criteria: Criterion[] = [];
    for (const line of (nl === -1 ? '' : part.slice(nl + 1)).split('\n')) {
      const m = LINE.exec(line.trim());
      if (!m || !isCriterionKind(m[2])) continue;
      criteria.push({ id: m[1], kind: m[2], text: m[4].trim(), ...(m[3] ? { source: m[3] } : {}) });
    }
    out.push({ ticketKey: head[1], ticketId: head[2], criteria, ...(head[3] ? { confirmed: true } : {}) });
  }
  return out;
}
