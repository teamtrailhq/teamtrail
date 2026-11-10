import { marker, markerJson, trailingMarker } from '../../model/markerText';
import { guardMarkers, oneLine } from '../../model/safeText';
import type { DecisionRecord } from '../../model/types';
import { webUrl } from '../../model/webUrl';
import { DECISION_SOURCES, isSourceKind } from '../../planning/decisions/decisionRecord';
import { fitDecision } from './fitDecision';

/** A decision record rides on a comment that ends in `<!-- teamtrail:decision {json} -->`. */
const NAME = 'decision';
/** A record's id as Teamtrail allocates it (syncedAdapter.ts nextDecisionId stays within it). */
export const DECISION_ID = /^D-\d{1,9}$/;

/** Readable record for people in the tracker, plus the full record for Teamtrail. */
export function decisionComment(d: DecisionRecord): string {
  // Who posted a record is read from the tracker, never from the record; every field is capped to fit a comment.
  const { record: rec, readable: r } = fitDecision(d);
  const json = markerJson(rec);
  // The readable part is text for people; only the marker at the end is the record.
  const text = guardMarkers;
  const superseded = rec.supersededBy ? ` · ~~superseded by ${rec.supersededBy}~~` : '';
  const source = DECISION_SOURCES[d.source.kind]?.label ?? d.source.kind;
  const lines = [
    `**Decision ${rec.id}**${superseded} · ${oneLine(rec.decidedBy)} · ${source}${sourceLink(rec)}`,
    '',
    `> ${text(r.summary).replace(/\n/g, '\n> ')}`,
    ...(r.answer.trim() !== r.summary.trim() ? ['', text(r.answer.trim())] : []),
    '',
    `**Question:** ${text(r.question)}`,
    ...(r.alternatives ? [`**Alternatives:** ${text(r.alternatives)}`] : []),
    ...(r.rationale ? [`**Rationale:** ${text(r.rationale)}`] : []),
    ...(rec.supersedes ? [`**Supersedes:** ${rec.supersedes}`] : []),
    '',
    marker(NAME, json),
  ];
  return lines.join('\n');
}

/** The source as a markdown link, only for a web URL; its label can't close the link or break the line. */
function sourceLink(d: Pick<DecisionRecord, 'source'>) {
  const url = webUrl(d.source.url);
  if (!url) return '';
  const label = oneLine(d.source.label ?? 'source').replace(/[[\]()]/g, '');
  return ` · [${label || 'source'}](${encodeURI(decodeURI(url)).replace(/[()]/g, encodeURIComponent)})`;
}

const list = <T>(v: T[] | undefined): T[] => (Array.isArray(v) ? v : []);

const isId = (v: unknown): v is string => typeof v === 'string' && DECISION_ID.test(v);

const isRecord = (d: DecisionRecord | null) =>
  !!d &&
  typeof d.id === 'string' &&
  DECISION_ID.test(d.id) &&
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
    const { postedBy: _postedBy, postedIn: _postedIn, supersedes, supersededBy, ...rec } = d;
    return {
      ...rec,
      ...(isId(supersedes) ? { supersedes } : {}),
      ...(isId(supersededBy) ? { supersededBy } : {}),
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
