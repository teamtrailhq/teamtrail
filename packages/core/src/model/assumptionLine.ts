import { isAssumptionStatus, type Assumption } from './assumption';
import { BRAND } from './brand';
import { guardMarkers, oneLine, unguardMarkers } from './safeText';

/*
 * One assumption as a line of the map body's Assumptions section:
 *   - [holding] The v2 API supports batch writes <!-- teamtrail:asm {"id":"S-1","tickets":["4","7"]} -->
 * People read the status and text; the marker keeps the id, links and challenge. A hand-written line without a
 * marker (or without a status) still parses: it holds, and gets the next free id.
 */
const P = BRAND.labelPrefix;
const LINE_RE = new RegExp(`^-\\s+(?:\\[([a-z]+)\\]\\s+)?(.*?)\\s*(?:<!-- ${P}:asm (\\{.*\\}) -->)?\\s*$`);
const MAX_EVIDENCE = 1000;

type Marker = Pick<Assumption, 'id' | 'tickets' | 'source' | 'challenge' | 'decidedBy'>;

/** JSON inside an HTML comment must never contain `--`. */
const escapeJson = (s: string) => s.replace(/--/g, '-\\u002d');

export function assumptionLine(a: Assumption): string {
  const marker: Marker = {
    id: a.id,
    tickets: a.tickets,
    ...(a.source ? { source: a.source } : {}),
    ...(a.challenge ? { challenge: { ...a.challenge, evidence: a.challenge.evidence.slice(0, MAX_EVIDENCE) } } : {}),
    ...(a.decidedBy ? { decidedBy: a.decidedBy } : {}),
  };
  return `- [${a.status}] ${guardMarkers(oneLine(a.text))} <!-- ${P}:asm ${escapeJson(JSON.stringify(marker))} -->`;
}

/** Parses the section's lines; ids missing from hand-written lines are filled in after the highest one. */
export function parseAssumptionLines(lines: string[]): Assumption[] {
  const parsed = lines.map(parseLine);
  let next = Math.max(0, ...parsed.map((a) => idNumber(a.id))) + 1;
  return parsed.map((a) => (a.id ? a : { ...a, id: `S-${next++}` }));
}

function parseLine(line: string): Assumption {
  const m = line.match(LINE_RE);
  const status = m?.[1];
  const text = unguardMarkers(m?.[2] ?? line.replace(/^-\s+/, ''));
  const marker = readMarker(m?.[3]);
  return {
    id: marker.id ?? '',
    text,
    status: isAssumptionStatus(status) ? status : 'holding',
    tickets: Array.isArray(marker.tickets) ? marker.tickets.map(String) : [],
    ...(marker.source ? { source: marker.source } : {}),
    ...(marker.challenge ? { challenge: marker.challenge } : {}),
    ...(marker.decidedBy ? { decidedBy: marker.decidedBy } : {}),
  };
}

function readMarker(json: string | undefined): Partial<Marker> {
  if (!json) return {};
  try {
    const v = JSON.parse(json) as Partial<Marker>;
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

/** `S-12` → 12; anything else → 0. */
export function idNumber(id: string | undefined): number {
  const m = id?.match(/^S-(\d+)$/);
  return m ? Number(m[1]) : 0;
}
