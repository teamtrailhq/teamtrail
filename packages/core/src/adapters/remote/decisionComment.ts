import { marker, markerJson, trailingMarker } from '../../model/markerText';
import { guardMarkers, oneLine } from '../../model/safeText';
import type { DecisionRecord } from '../../model/types';
import { webUrl } from '../../model/webUrl';
import { DECISION_SOURCES, isSourceKind } from '../../planning/decisions/decisionRecord';
import { teammatePerson } from './writer';

/** A decision record rides on a comment that ends in `<!-- teamtrail:decision {json} -->`. */
const NAME = 'decision';
/** GitHub caps comments at 65 536 characters. */
const MAX_COMMENT = 60_000;
const ID = /^D-\d{1,9}$/;

/** Readable record for people in the tracker, plus the full record for Teamtrail. */
export function decisionComment(d: DecisionRecord): string {
  // Who posted a record is read from the tracker, never from the record.
  const { postedBy: _postedBy, ...own } = d;
  let rec: Omit<DecisionRecord, 'postedBy'> = own;
  let json = markerJson(rec);
  while (json.length > MAX_COMMENT - 4000 && rec.transcript.length) {
    rec = { ...rec, transcript: rec.transcript.slice(0, -Math.ceil(rec.transcript.length / 4)) };
    json = markerJson(rec);
  }
  // The readable part is text for people; only the marker at the end is the record.
  const text = guardMarkers;
  const superseded = d.supersededBy ? ` · ~~superseded by ${d.supersededBy}~~` : '';
  const source = DECISION_SOURCES[d.source.kind]?.label ?? d.source.kind;
  const lines = [
    `**Decision ${d.id}**${superseded} · ${d.decidedBy} · ${source}${sourceLink(d)}`,
    '',
    `> ${text(d.summary).replace(/\n/g, '\n> ')}`,
    ...(d.answer.trim() !== d.summary.trim() ? ['', text(d.answer.trim())] : []),
    '',
    `**Question:** ${text(d.question)}`,
    ...(d.alternatives.length ? [`**Alternatives:** ${text(d.alternatives.join('; '))}`] : []),
    ...(d.rationale ? [`**Rationale:** ${text(d.rationale)}`] : []),
    ...(d.supersedes ? [`**Supersedes:** ${d.supersedes}`] : []),
    '',
    marker(NAME, json),
  ];
  return lines.join('\n');
}

/** The source as a markdown link, only for a web URL; its label can't close the link or break the line. */
function sourceLink(d: DecisionRecord) {
  const url = webUrl(d.source.url);
  if (!url) return '';
  const label = oneLine(d.source.label ?? 'source').replace(/[[\]()]/g, '');
  return ` · [${label || 'source'}](${encodeURI(decodeURI(url)).replace(/[()]/g, encodeURIComponent)})`;
}

/** Whether a comment ends in a decision marker (a record, or one too broken to read). */
export const isDecisionComment = (body: string) => !!trailingMarker(body.replace(/\r\n/g, '\n'), NAME);

const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

const isRecord = (d: DecisionRecord | null) =>
  !!d &&
  typeof d.id === 'string' &&
  ID.test(d.id) &&
  typeof d.decidedBy === 'string' &&
  typeof d.question === 'string' &&
  typeof d.answer === 'string' &&
  !!d.source &&
  isSourceKind(d.source.kind);

/** The record a comment of this machine's own account carries, when it ends in a well-formed one. */
export function parseDecisionComment(body: string): DecisionRecord | undefined {
  const found = trailingMarker(body.replace(/\r\n/g, '\n'), NAME);
  if (!found) return undefined;
  try {
    const d = JSON.parse(found.payload) as DecisionRecord;
    if (!isRecord(d)) return undefined;
    const { postedBy: _postedBy, ...rec } = d;
    return {
      ...rec,
      summary: typeof d.summary === 'string' ? d.summary : d.answer,
      rationale: typeof d.rationale === 'string' ? d.rationale : '',
      alternatives: list(d.alternatives).filter((a) => typeof a === 'string'),
      participants: list(d.participants).filter((p) => typeof p?.id === 'string'),
      transcript: list(d.transcript).filter((e) => typeof e?.author === 'string' && typeof e.text === 'string'),
    };
  } catch {
    return undefined;
  }
}

/**
 * A record another account posted: still a decision, but that person's. Their "trail lead" is shown under their
 * tracker name, and `postedBy` keeps it from standing in for this machine's human (policy checks).
 */
export function teammateDecision(d: DecisionRecord, name: string): DecisionRecord {
  return {
    ...d,
    decidedBy: teammatePerson(d.decidedBy, name),
    participants: d.participants.map((p) => ({ ...p, id: teammatePerson(p.id, name) })),
    transcript: d.transcript.map((e) => ({ ...e, author: teammatePerson(e.author, name) })),
    postedBy: name,
  };
}
