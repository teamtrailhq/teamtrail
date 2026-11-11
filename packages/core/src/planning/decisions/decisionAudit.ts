import type {
  DecisionRecord,
  MapSnapshot,
  TranscriptEntry,
  DecisionSourceKind,
  DecisionStatus,
} from '../../model/types';
import { firstSentence, decisionStatus, DECISION_SOURCE_KINDS, madeBy, UNVERIFIED } from './decisionRecord';

/* ---------- audit view ---------- */

export interface AuditDecision extends DecisionRecord {
  /**
   * Derived from text (a closed ticket's resolution comment, the map's "Decisions so far"); not a persisted record.
   * Unverified: anyone who can edit that text wrote it, so it is never the human's call (`madeBy`), and its
   * transcript never holds the human's words.
   */
  derived?: boolean;
}

/** A `**HITL transcript**` comment's turns: text in a comment, so each is only who it names, never the human. */
function commentTranscript(body: string, at: number): TranscriptEntry[] {
  return body
    .replace(/^\*\*HITL transcript\*\*\s*/, '')
    .split(/\n\n(?=\*\*[^*]+:\*\* )/)
    .map((p) => p.match(/^\*\*([^*]+):\*\* ([\s\S]*)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ from: 'agent' as const, author: m[1], text: m[2].trim(), at }));
}

/**
 * Persisted records plus one derived `tracker` record for every decided ticket
 * that has none (tickets closed before records existed, or by hand in the tracker).
 */
export function auditDecisions(snap: MapSnapshot, records: DecisionRecord[]): AuditDecision[] {
  const covered = new Set(records.map((r) => r.ticketId).filter(Boolean));
  const derived: AuditDecision[] = snap.tickets
    .filter((t) => t.state === 'closed' && t.closeReason === 'completed' && !covered.has(t.id))
    .map((t) => {
      const c = [...t.comments].reverse().find((x) => x.body.startsWith('**Resolution**'));
      const answer = c
        ? c.body.replace(/^\*\*Resolution\*\*\s*/, '')
        : (snap.map.sections.decisions.find((d) => d.ticketId === t.id || d.ticketKey === t.key)?.text ?? '');
      const author = c?.author ?? t.assignee ?? 'unknown';
      const posted = t.comments.find((x) => x.body.startsWith('**HITL transcript**'));
      const transcript = posted ? commentTranscript(posted.body, posted.createdAt) : [];
      return {
        id: `T${t.key}`,
        mapId: snap.map.id,
        ticketId: t.id,
        ticketKey: t.key,
        question: t.title,
        answer,
        summary: firstSentence(answer),
        alternatives: [],
        rationale: '',
        // never the human's role: the author is only who the text names (kept when the record is persisted)
        decidedBy: `${author}${UNVERIFIED}`,
        decidedAt: t.closedAt ?? c?.createdAt ?? t.updatedAt,
        participants: [...new Set([author, ...transcript.map((e) => e.author)])].map((id) => ({ id })),
        source: {
          kind: 'tracker',
          ref: `${snap.map.id}/tickets/${t.id}`,
          label: `unverified, from text: ${c ? `${t.key} resolution comment` : 'the map’s Decisions so far'}`,
        },
        transcript,
        derived: true,
      };
    });
  return [...records, ...derived].sort((a, b) => b.decidedAt - a.decidedAt);
}

export interface DecisionFilter {
  mapId?: string;
  source?: DecisionSourceKind;
  decidedBy?: string;
  /** Decisions agents made themselves, or the ones people made (see `madeBy`). */
  madeBy?: 'agent' | 'human';
  status?: DecisionStatus;
  query?: string;
}

export function filterDecisions<T extends DecisionRecord>(all: T[], f: DecisionFilter): T[] {
  const q = f.query?.trim().toLowerCase();
  return all.filter(
    (d) =>
      (!f.mapId || d.mapId === f.mapId) &&
      (!f.source || d.source.kind === f.source) &&
      (!f.decidedBy || d.decidedBy === f.decidedBy) &&
      (!f.madeBy || madeBy(d) === f.madeBy) &&
      (!f.status || decisionStatus(d) === f.status) &&
      (!q ||
        [
          d.id,
          d.ticketKey,
          d.question,
          d.answer,
          d.summary,
          d.rationale,
          d.decidedBy,
          ...d.alternatives,
          ...d.transcript.map((e) => e.text),
        ]
          .join('\n')
          .toLowerCase()
          .includes(q)),
  );
}

/** `metrics.decisionStats`: counts behind the Decisions view readouts. */
export function decisionStats(all: DecisionRecord[], now = Date.now()) {
  const bySource = Object.fromEntries(DECISION_SOURCE_KINDS.map((k) => [k, 0])) as Record<DecisionSourceKind, number>;
  let superseded = 0;
  let last24h = 0;
  let human = 0;
  for (const d of all) {
    bySource[d.source.kind]++;
    if (d.supersededBy) superseded++;
    if (now - d.decidedAt < 86_400_000) last24h++;
    // This machine's human made the call (see `madeBy`), or took part in the conversation behind one of its
    // records; a teammate's record (`madeBy` says so) never counts, whoever its transcript names.
    const by = madeBy(d);
    if (by === 'human' || (by === 'agent' && d.transcript.some((e) => e.from === 'human'))) human++;
  }
  return { total: all.length, active: all.length - superseded, superseded, last24h, human, bySource };
}
