import { type Front, iso, writeFront, parseFront, str, arr, time } from '../../model/frontmatter';
import { guardLines, oneLine, unguardLines } from '../../model/safeText';
import type { Participant, DecisionRecord, TranscriptEntry, DecisionSource } from '../../model/types';
import { isSourceKind, firstSentence } from './decisionRecord';
import { riskFront, riskOf } from './decisionRiskFront';

/* ---------- local-markdown file: <trail>/decisions/<id>.md ---------- */

const SECTIONS = ['Question', 'Decision', 'Summary', 'Alternatives', 'Rationale', 'Transcript'] as const;

/** The lines the reader takes for structure: the section headings, and inside the transcript each entry's head. */
const SECTION = `## (?:${SECTIONS.join('|')})\\s*$`;
const IN_TRANSCRIPT = `${SECTION}|### `;
const block = (text: string) => guardLines(text.trim(), SECTION);

const participantOut = (p: Participant) => (p.name ? `${p.id}|${p.name}` : p.id);

const participantIn = (s: string): Participant => {
  const i = s.indexOf('|');
  return i < 0 ? { id: s } : { id: s.slice(0, i), name: s.slice(i + 1) };
};

export function serializeDecision(d: DecisionRecord): string {
  const front: Front = {
    id: d.id,
    trail: d.mapId,
    ...(d.ticketId ? { ticket: d.ticketId, ticket_key: d.ticketKey ?? '' } : {}),
    decided_by: d.decidedBy,
    decided_at: iso(d.decidedAt),
    participants: d.participants.map(participantOut),
    source: d.source.kind,
    ...(d.source.ref ? { source_ref: d.source.ref } : {}),
    ...(d.source.url ? { source_url: d.source.url } : {}),
    ...(d.source.label ? { source_label: d.source.label } : {}),
    ...(d.source.meta ? { source_meta: Object.entries(d.source.meta).map(([k, v]) => `${k}=${v}`) } : {}),
    ...(d.supersedes ? { supersedes: d.supersedes } : {}),
    ...(d.supersededBy ? { superseded_by: d.supersededBy } : {}),
    ...riskFront(d.risk),
    ...(d.assumes?.length ? { assumes: d.assumes } : {}),
  };
  const list = (xs: string[]) => (xs.length ? xs.map((x) => `- ${oneLine(x)}`).join('\n') : '_None._');
  const transcript = d.transcript.length
    ? d.transcript
        .map(
          (e) => `### ${oneLine(e.author)} · ${e.from} @ ${iso(e.at)}\n\n${guardLines(e.text.trim(), IN_TRANSCRIPT)}`,
        )
        .join('\n\n')
    : '_None._';
  const body = [
    `## Question\n\n${block(d.question)}`,
    `## Decision\n\n${block(d.answer)}`,
    `## Summary\n\n${block(d.summary)}`,
    `## Alternatives\n\n${list(d.alternatives)}`,
    `## Rationale\n\n${block(d.rationale) || '_None._'}`,
    `## Transcript\n\n${transcript}`,
  ].join('\n\n');
  return writeFront(front, body);
}

export function parseDecision(md: string): DecisionRecord {
  const { front, body } = parseFront(md);
  const sec: Partial<Record<(typeof SECTIONS)[number], string>> = {};
  const re = new RegExp(`^## (${SECTIONS.join('|')})\\s*$`, 'gm');
  const marks = [...body.matchAll(re)];
  marks.forEach((m, i) => {
    const text = body.slice(m.index! + m[0].length, marks[i + 1]?.index ?? body.length).trim();
    const name = m[1] as (typeof SECTIONS)[number];
    // The transcript keeps its guards until its entries are split.
    const plain = name === 'Transcript' ? text : unguardLines(text, SECTION);
    sec[name] = /^_none\._$/i.test(text) ? '' : plain;
  });
  const transcript: TranscriptEntry[] = (sec.Transcript ?? '')
    .split(/^### /m)
    .slice(1)
    .map((chunk) => {
      const nl = chunk.indexOf('\n');
      const head = nl < 0 ? chunk : chunk.slice(0, nl);
      const [who, at = ''] = head.split(' @ ');
      const [author, from = 'agent'] = who.split(' · ');
      return {
        author: author.trim(),
        from: (['agent', 'human', 'system'].includes(from.trim()) ? from.trim() : 'agent') as TranscriptEntry['from'],
        at: Date.parse(at) || 0,
        text: nl < 0 ? '' : unguardLines(chunk.slice(nl + 1).trim(), IN_TRANSCRIPT),
      };
    });
  const kind = str(front.source);
  const meta = arr(front.source_meta);
  const source: DecisionSource = {
    kind: isSourceKind(kind) ? kind : 'tracker',
    ...(str(front.source_ref) ? { ref: str(front.source_ref) } : {}),
    ...(str(front.source_url) ? { url: str(front.source_url) } : {}),
    ...(str(front.source_label) ? { label: str(front.source_label) } : {}),
    ...(meta.length
      ? { meta: Object.fromEntries(meta.map((kv) => [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)])) }
      : {}),
  };
  const answer = sec.Decision ?? '';
  return {
    id: str(front.id),
    mapId: str(front.trail),
    ticketId: str(front.ticket) || undefined,
    ticketKey: str(front.ticket_key) || undefined,
    question: sec.Question ?? '',
    answer,
    summary: sec.Summary || firstSentence(answer),
    alternatives: (sec.Alternatives ?? '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2)),
    rationale: sec.Rationale ?? '',
    decidedBy: str(front.decided_by),
    decidedAt: time(front.decided_at),
    participants: arr(front.participants).map(participantIn),
    source,
    supersedes: str(front.supersedes) || undefined,
    supersededBy: str(front.superseded_by) || undefined,
    ...(arr(front.assumes).length ? { assumes: arr(front.assumes) } : {}),
    transcript,
    ...riskOf(front),
  };
}
