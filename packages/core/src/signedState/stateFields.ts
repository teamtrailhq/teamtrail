import type { DecisionRecord, MapDoc, Ticket } from '../model/types';
import { contentHash } from '../trust/trustLedger';

/*
 * The fields of a trail that gates read and that say what the human decided: the only part of a tracker file the
 * signed state record (stateRecord.ts) keeps. Free text (titles, bodies, comments, notes) is never in here; it may
 * be edited anywhere. Each field is flat, named as in the file, and holds a plain JSON value (null when unset).
 */
export type FieldValue = string | boolean | string[] | null;
export type Fields = Record<string, FieldValue>;

/** Ticket fields: what a gate checks, who holds it, what blocks it. */
export const TICKET_KEYS = [
  'type',
  'hitl',
  'state',
  'close_reason',
  'assignee',
  'status',
  'blocked_by',
  'review_of',
  'verification',
  'checks',
  'guide',
] as const;

/** A ticket's fields that say what happened to it; a ticket nobody signed has none of them set (unsignedTicket). */
export const PROGRESS_KEYS = ['state', 'close_reason', 'assignee', 'status', 'review_of', 'verification', 'checks'];

/**
 * Trail fields (`destination` is a hash of its text); each assumption's status is a field of its own, `assumption:S-<n>`.
 * `archived` is null on an active trail, so a record written before it existed still reads the same.
 */
export const MAP_KEYS = ['mode', 'destination', 'verification', 'guides', 'model_matching', 'archived'] as const;
/** The hash of a trail's destination: what it is for is the human's, so rewriting it is a change, not a text edit. */
export const destinationHash = (m: MapDoc) => contentHash(m.sections.destination ?? '');
export const ASSUMPTION_PREFIX = 'assumption:';

/** Decision fields; `words` is the hash of its words (`decisionWords`). */
export const DECISION_KEYS = [
  'id',
  'ticket',
  'decided_by',
  'source',
  'source_ref',
  'supersedes',
  'superseded_by',
  'risk',
  'words',
] as const;

const opt = (v: string | undefined | null): FieldValue => v || null;
/** JSON with object keys sorted at every level: the same value always reads the same. */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
const list = (v: string[] | undefined): FieldValue => (v ? [...v] : null);

export function ticketFields(t: Ticket): Fields {
  return {
    type: t.type,
    hitl: !!t.hitl,
    state: t.state,
    close_reason: opt(t.closeReason),
    assignee: opt(t.assignee),
    status: opt(t.status),
    blocked_by: [...t.blockedBy].sort(),
    review_of: opt(t.reviewOf),
    verification: opt(t.verification),
    checks: list(t.checks),
    guide: opt(t.guide),
  };
}

export function mapFields(m: MapDoc): Fields {
  const assumptions = (m.sections.assumptions ?? []).map((a) => [`${ASSUMPTION_PREFIX}${a.id}`, a.status]);
  return {
    mode: m.mode,
    destination: destinationHash(m),
    verification: opt(m.verification),
    guides: list(m.guides),
    model_matching: m.modelMatching ? canon(m.modelMatching) : null,
    archived: m.archived ? true : null,
    ...Object.fromEntries(assumptions),
  };
}

/** A decision's words, each as stated: rewording any of them is a change to the decision (stateLines.ts shows it). */
export function decisionWords(d: DecisionRecord) {
  return {
    question: d.question,
    answer: d.answer,
    summary: d.summary,
    rationale: d.rationale,
    alternatives: d.alternatives.join('\n'),
    assumes: (d.assumes ?? []).join(', '),
    'human’s words': d.transcript
      .filter((e) => e.from === 'human')
      .map((e) => `${e.author}: ${e.text}`)
      .join('\n'),
  };
}

/**
 * The words a decision rests on, as one hash: the question, the answer, its summary, rationale, alternatives and
 * the assumptions it relies on, and the human's words in the transcript. Rewording any is a change to the decision.
 */
const words = (d: DecisionRecord) => contentHash(JSON.stringify(Object.values(decisionWords(d))));

export function decisionFields(d: DecisionRecord): Fields {
  return {
    id: d.id,
    ticket: opt(d.ticketId),
    decided_by: d.decidedBy,
    source: d.source.kind,
    source_ref: opt(d.source.ref),
    supersedes: opt(d.supersedes),
    superseded_by: opt(d.supersededBy),
    risk: d.risk ? canon(d.risk) : null,
    words: words(d),
  };
}

export const sameValue = (a: FieldValue | undefined, b: FieldValue | undefined) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The keys whose values differ between two sets of fields, in a stable order. */
export function changedKeys(a: Fields, b: Fields): string[] {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  return keys.filter((k) => !sameValue(a[k], b[k]));
}

/** `sha256:` of the fields, keys sorted: what the record signs per item. */
export const fieldsHash = (f: Fields) =>
  contentHash(
    JSON.stringify(
      Object.keys(f)
        .sort()
        .map((k) => [k, f[k]]),
    ),
  );
