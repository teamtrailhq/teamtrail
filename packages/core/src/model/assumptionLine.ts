import { isAssumptionStatus, type Assumption } from './assumption';
import { marker as markerText, markerJson, trailingMarker } from './markerText';
import { guardMarkers, oneLine, unguardMarkers } from './safeText';

/*
 * One assumption as a line of the map body's Assumptions section:
 *   - [holding] The v2 API supports batch writes <!-- teamtrail:asm {"id":"S-1","tickets":["4","7"]} -->
 * People read the status and text; the marker keeps the id, links and challenge. A hand-written line without a
 * marker (or without a status) still parses: it holds, and gets the next free id.
 */
const NAME = 'asm';
/** `- [status] ` at the start of a line; the rest is the text and, at the very end, the marker. */
const HEAD_RE = /^-\s+(?:\[([a-z]+)\]\s+)?/;
const MAX_EVIDENCE = 1000;

type Marker = Pick<Assumption, 'id' | 'tickets' | 'source' | 'challenge' | 'decidedBy'>;

export function assumptionLine(a: Assumption): string {
  const marker: Marker = {
    id: a.id,
    tickets: a.tickets,
    ...(a.source ? { source: a.source } : {}),
    ...(a.challenge ? { challenge: { ...a.challenge, evidence: a.challenge.evidence.slice(0, MAX_EVIDENCE) } } : {}),
    ...(a.decidedBy ? { decidedBy: a.decidedBy } : {}),
  };
  return `- [${a.status}] ${guardMarkers(oneLine(a.text))} ${markerText(NAME, markerJson(marker))}`;
}

/** Parses the section's lines; ids missing from hand-written lines are filled in after the highest one. */
export function parseAssumptionLines(lines: string[]): Assumption[] {
  const parsed = lines.map(parseLine);
  let next = Math.max(0, ...parsed.map((a) => idNumber(a.id))) + 1;
  return parsed.map((a) => (a.id ? a : { ...a, id: `S-${next++}` }));
}

function parseLine(line: string): Assumption {
  const found = trailingMarker(line, NAME);
  const rest = found ? found.before : line;
  const head = rest.match(HEAD_RE);
  const status = head?.[1];
  const text = unguardMarkers(rest.slice(head ? head[0].length : 0).trim());
  const marker = readMarker(found?.payload);
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
