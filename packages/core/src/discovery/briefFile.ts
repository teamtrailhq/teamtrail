import { iso, parseFront, time, writeFront } from '../model/frontmatter';
import { guardLines, oneLine, unguardLines } from '../model/safeText';
import { type BriefSections, type BriefStatus, type DiscoveryBrief, EMPTY_SECTIONS } from './brief';

/** `briefs/<mapId>.md`: frontmatter (status, ticket, author, times, note) plus one `##` section per part. */
const HEADINGS: [keyof BriefSections, string][] = [
  ['summary', 'Summary'],
  ['productContext', 'Product context'],
  ['existing', 'Existing implementation'],
  ['conventions', 'Conventions and abstractions'],
  ['dataModel', 'Data model impact'],
  ['api', 'API impact'],
  ['risks', 'Risks and possible regressions'],
  ['assumptions', 'Assumptions'],
  ['openQuestions', 'Open questions'],
];

export const BRIEF_SECTION_LABEL = Object.fromEntries(HEADINGS) as Record<keyof BriefSections, string>;

/** Any `## ` line starts a section for the reader. */
const HEADING = '##\\s';

const STATUSES: BriefStatus[] = ['draft', 'submitted', 'accepted', 'changes-requested'];
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function sectionText(s: BriefSections, k: keyof BriefSections): string {
  if (k === 'assumptions') return s.assumptions.map((a) => `- ${oneLine(a.id)}: ${oneLine(a.text)}`).join('\n');
  if (k === 'openQuestions') return s.openQuestions.map((q) => `- ${oneLine(q)}`).join('\n');
  return guardLines(s[k].trim(), HEADING);
}

export function serializeBrief(b: DiscoveryBrief): string {
  const front: Record<string, string> = { status: b.status };
  if (b.ticketId) front.ticket = b.ticketId;
  if (b.author) front.author = b.author;
  if (b.submittedAt) front.submitted = iso(b.submittedAt);
  if (b.decidedAt) front.decided = iso(b.decidedAt);
  if (b.note) front.note = b.note;
  const s = b.sections;
  const body = HEADINGS.map(([k, h]) => {
    const text = sectionText(s, k);
    return `## ${h}\n\n${text || '_None yet._'}`;
  }).join('\n\n');
  return writeFront(front, `${body}\n`);
}

export function parseBrief(mapId: string, md: string): DiscoveryBrief {
  const { front, body } = parseFront(md);
  const sections: BriefSections = { ...EMPTY_SECTIONS, assumptions: [], openQuestions: [] };
  for (const part of body.split(/^##\s+/m).slice(1)) {
    const nl = part.indexOf('\n');
    const heading = part
      .slice(0, nl === -1 ? undefined : nl)
      .trim()
      .toLowerCase();
    const text = (nl === -1 ? '' : part.slice(nl + 1)).trim();
    const key = HEADINGS.find(([, h]) => h.toLowerCase() === heading)?.[0];
    if (!key || /^_none yet\._$/i.test(text)) continue;
    const items = text
      .split('\n')
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim());
    if (key === 'openQuestions') sections.openQuestions = items;
    else if (key === 'assumptions')
      sections.assumptions = items.map((l, i) => {
        const m = l.match(/^(A-\d+):\s*(.*)$/);
        return m ? { id: m[1], text: m[2] } : { id: `A-${i + 1}`, text: l };
      });
    else sections[key] = unguardLines(text, HEADING);
  }
  const status = STATUSES.find((x) => x === front.status) ?? 'draft';
  return {
    mapId,
    status,
    ticketId: str(front.ticket),
    author: str(front.author),
    submittedAt: time(front.submitted) || undefined,
    decidedAt: time(front.decided) || undefined,
    note: str(front.note),
    sections,
  };
}
