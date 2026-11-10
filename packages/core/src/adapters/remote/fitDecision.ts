import type { DecisionRecord } from '../../model/types';

/*
 * A decision comment has to fit a tracker comment (GitHub: 65 536 characters) with its record intact, or the
 * record would be lost on the next read. The record's JSON stays under RECORD_MAX (well inside the marker reader's
 * cap), the readable part above it under the rest. Agents' inputs are already bounded (cli mcp/lineSafety.ts);
 * these caps hold whatever the source.
 */
const RECORD_MAX = 40_000;
const CAP = { line: 300, summary: 600, question: 4_000, answer: 16_000, rationale: 8_000, entry: 2_000 } as const;
const READABLE = { answer: 8_000, rationale: 4_000, alternatives: 2_000 } as const;
const MAX_ALTERNATIVES = 20;
const MAX_PARTICIPANTS = 50;
const MAX_URL = 2_000;

export type StoredDecision = Omit<DecisionRecord, 'postedBy' | 'postedIn'>;

export interface FittedDecision {
  record: StoredDecision;
  readable: { summary: string; answer: string; question: string; alternatives: string; rationale: string };
}

const cut = (s: string | undefined, n: number) => {
  const t = s ?? '';
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function capped(d: DecisionRecord): StoredDecision {
  const { postedBy: _postedBy, postedIn: _postedIn, ...rec } = d;
  const { source } = rec;
  return {
    ...rec,
    decidedBy: cut(rec.decidedBy, CAP.line),
    question: cut(rec.question, CAP.question),
    answer: cut(rec.answer, CAP.answer),
    summary: cut(rec.summary, CAP.summary),
    rationale: cut(rec.rationale, CAP.rationale),
    alternatives: rec.alternatives.slice(0, MAX_ALTERNATIVES).map((a) => cut(a, CAP.line)),
    participants: rec.participants.slice(0, MAX_PARTICIPANTS).map((p) => ({ ...p, id: cut(p.id, CAP.line) })),
    transcript: rec.transcript.map((e) => ({ ...e, author: cut(e.author, CAP.line), text: cut(e.text, CAP.entry) })),
    source: {
      ...source,
      ...(source.label ? { label: cut(source.label, CAP.line) } : {}),
      ...(source.ref ? { ref: cut(source.ref, CAP.line) } : {}),
      ...(source.url ? { url: source.url.slice(0, MAX_URL) } : {}),
    },
  };
}

const size = (r: StoredDecision) => JSON.stringify(r).replace(/--/g, '-\\u002d').length;

/** Drops transcript entries from the end, then shortens the long texts, until the record fits. */
function shrink(rec: StoredDecision): StoredDecision {
  let r = rec;
  while (size(r) > RECORD_MAX && r.transcript.length)
    r = { ...r, transcript: r.transcript.slice(0, -Math.ceil(r.transcript.length / 4)) };
  // Escaped characters (controls, quotes) can make text grow in JSON: halve until it fits.
  while (size(r) > RECORD_MAX && r.answer.length + r.rationale.length + r.question.length > 64)
    r = {
      ...r,
      answer: cut(r.answer, Math.ceil(r.answer.length / 2)),
      rationale: cut(r.rationale, Math.ceil(r.rationale.length / 2)),
      question: cut(r.question, Math.ceil(r.question.length / 2)),
    };
  return r;
}

export function fitDecision(d: DecisionRecord): FittedDecision {
  const record = shrink(capped(d));
  return {
    record,
    readable: {
      summary: record.summary,
      answer: cut(record.answer, READABLE.answer),
      question: cut(record.question, CAP.question),
      alternatives: cut(record.alternatives.join('; '), READABLE.alternatives),
      rationale: cut(record.rationale, READABLE.rationale),
    },
  };
}
