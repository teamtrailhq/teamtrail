import { assumptionLine, parseAssumptionLines } from './assumptionLine';
import { guardLines, guardMarkers, oneLine, unguardLines, unguardMarkers } from './safeText';
import type { Decision, MapSections } from './types';

/**
 * Canonical markdown body of a map issue. Shared by every adapter
 * that stores the map as markdown (local files, GitHub issue body, Linear
 * description), so the format stays identical across trackers.
 */
const HEADINGS: [keyof MapSections, string][] = [
  ['destination', 'Destination'],
  ['notes', 'Notes'],
  ['assumptions', 'Assumptions'],
  ['decisions', 'Decisions so far'],
  ['unspecified', 'Not yet specified'],
  ['outOfScope', 'Out of scope'],
];

/** Display name of each map section, as used in headings and UI copy. */
export const SECTION_LABEL = Object.fromEntries(HEADINGS) as Record<keyof MapSections, string>;

/** Any `## ` line starts a section for the reader, so free text may not hold one; nor a marker of ours. */
const HEADING = '##\\s';
const block = (text: string) => guardMarkers(guardLines(text.trim(), HEADING));
const unblock = (text: string) => unguardLines(unguardMarkers(text), HEADING);
const item = (text: string) => guardMarkers(oneLine(text));

const DECISION_RE = /^-\s+(?:\[?([#A-Z0-9-]+)\]?:?\s+)?(.*)$/;

export function serializeMapBody(s: MapSections): string {
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${item(x)}`).join('\n') : '_None yet._');
  const decisions = (ds: Decision[]) =>
    ds.length
      ? ds.map((d) => `- ${d.ticketKey ? `${oneLine(d.ticketKey)}: ` : ''}${item(d.text)}`).join('\n')
      : '_None yet._';
  return (
    [
      `## Destination\n\n${block(s.destination)}`,
      `## Notes\n\n${block(s.notes) || '_None yet._'}`,
      // Only trails that list assumptions get the section, so older maps keep their exact body.
      ...(s.assumptions?.length ? [`## Assumptions\n\n${s.assumptions.map(assumptionLine).join('\n')}`] : []),
      `## Decisions so far\n\n${decisions(s.decisions)}`,
      `## Not yet specified\n\n${list(s.unspecified)}`,
      `## Out of scope\n\n${list(s.outOfScope)}`,
    ].join('\n\n') + '\n'
  );
}

export function parseMapBody(md: string): MapSections {
  const out: MapSections = { destination: '', notes: '', decisions: [], unspecified: [], outOfScope: [] };
  const parts = md.split(/^##\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const heading = part
      .slice(0, nl === -1 ? undefined : nl)
      .trim()
      .toLowerCase();
    const body = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    const key = HEADINGS.find(([, h]) => h.toLowerCase() === heading)?.[0];
    if (!key) continue;
    const empty = /^_none yet\._$/i.test(body);
    const items = empty
      ? []
      : body
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l.startsWith('- '));
    if (key === 'destination') out.destination = unblock(body);
    else if (key === 'notes') out.notes = empty ? '' : unblock(body);
    else if (key === 'assumptions') out.assumptions = parseAssumptionLines(items);
    else if (key === 'decisions')
      out.decisions = items.map((l) => {
        const m = l.match(DECISION_RE);
        return m && m[1] && /\d/.test(m[1])
          ? { ticketKey: m[1], text: unguardMarkers(m[2]) }
          : { text: unguardMarkers(l.slice(2)) };
      });
    else out[key] = items.map((l) => unguardMarkers(l.slice(2)));
  }
  return out;
}
