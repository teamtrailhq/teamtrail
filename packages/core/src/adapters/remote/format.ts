import { BRAND, HITL_LABEL, MAP_LABEL, PLAN_ONLY_LABEL, label, takesHitlLabel } from '../../model/brand';
import { levelOf, TICKET_STATUSES } from '../../model/lifecycle';
import { serializeMapBody } from '../../model/mapBody';
import {
  ALL_TICKET_TYPES,
  type Comment,
  type DecisionRecord,
  type MapDoc,
  type MapMode,
  type Ticket,
  type TicketType,
} from '../../model/types';
import { DECISION_SOURCES } from '../../planning/decisions/decisionRecord';

/*
 * How Teamtrail state rides on a plain issue tracker, shared by GitHub and Linear:
 *   ticket type, HITL, plan-only    labels (brand.ts)
 *   claim, status, verification     `<!-- teamtrail:meta {"assignee":…,"status":…} -->` at the end of the issue body;
 *                                   a human assignee in the tracker counts as a claim too; on the trail issue,
 *                                   the trail's verification level and model matching
 *   comment author                  `<!-- teamtrail:author <id> -->` first line (the API user posts every comment)
 *   comment write id                `<!-- teamtrail:write <id> -->` next line, so a replayed queued write can tell it already landed
 *   decision record                 a comment on its ticket (or the trail) ending in `<!-- teamtrail:decision {json} -->`
 */
const P = BRAND.labelPrefix;
const META_RE = new RegExp(`\\s*<!-- ${P}:meta (\\{.*?\\}) -->\\s*$`, 's');
const AUTHOR_RE = new RegExp(`^<!-- ${P}:author (.+?) -->\\n?`);
const WRITE_RE = new RegExp(`^<!-- ${P}:write (\\S+) -->\\n?`);
const DECISION_RE = new RegExp(`<!-- ${P}:decision (\\{.*\\}) -->\\s*$`, 's');
/** GitHub caps comments at 65 536 characters. */
const MAX_COMMENT = 60_000;

export interface BodyMeta {
  assignee?: string;
  status?: string;
  verification?: string;
  checks?: string[];
  reviewOf?: string;
  guide?: string;
  /** Trail issue: the team's guide ids. */
  guides?: string[];
  /** Trail issue only: its model matching. */
  modelMatching?: unknown;
}

/** The trail issue body: its sections, plus a meta marker only when the trail has a verification level, model matching or a team. */
export const mapBody = (m: Pick<MapDoc, 'sections' | 'verification' | 'modelMatching' | 'guides'>) =>
  m.verification || m.modelMatching || m.guides?.length
    ? joinBody(serializeMapBody(m.sections), {
        verification: m.verification,
        modelMatching: m.modelMatching,
        guides: m.guides?.length ? m.guides : undefined,
      })
    : serializeMapBody(m.sections);

/** Everything Teamtrail keeps in a ticket's meta marker, so one write never drops another's field. */
export const ticketMeta = (
  t: Pick<Ticket, 'assignee' | 'status' | 'verification' | 'checks' | 'reviewOf' | 'guide'>,
): BodyMeta => ({
  assignee: t.assignee,
  status: t.status,
  verification: t.verification,
  checks: t.checks,
  reviewOf: t.reviewOf,
  guide: t.guide,
});

export function splitBody(raw: string | null | undefined): { text: string; meta: BodyMeta } {
  const body = (raw ?? '').replace(/\r\n/g, '\n');
  const m = body.match(META_RE);
  if (!m) return { text: body.trim(), meta: {} };
  let meta: BodyMeta = {};
  try {
    meta = JSON.parse(m[1]);
  } catch {
    // a hand-edited marker is ignored rather than fatal
  }
  return { text: body.slice(0, m.index).trim(), meta };
}

export function joinBody(text: string, meta: BodyMeta): string {
  const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined && v !== ''));
  return Object.keys(clean).length ? `${text.trim()}\n\n<!-- ${P}:meta ${JSON.stringify(clean)} -->` : text.trim();
}

export const authoredBody = (author: string, body: string, writeId?: string) =>
  `<!-- ${P}:author ${author.replace(/-->/g, '')} -->\n${writeId ? `<!-- ${P}:write ${writeId.replace(/\s|-->/g, '')} -->\n` : ''}${body}`;

/** A tracker comment as a ticket comment; `undefined` for decision-record comments, which are not conversation. */
export function readComment(c: {
  id: string;
  body: string;
  author?: string;
  createdAt: string | number;
}): Comment | undefined {
  let body = c.body.replace(/\r\n/g, '\n');
  if (DECISION_RE.test(body)) return undefined;
  const m = body.match(AUTHOR_RE);
  if (m) body = body.slice(m[0].length);
  const w = body.match(WRITE_RE);
  if (w) body = body.slice(w[0].length);
  return {
    id: c.id,
    author: m ? m[1] : (c.author ?? 'unknown'),
    body: body.trim(),
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.parse(c.createdAt) || 0,
    ...(w ? { writeId: w[1] } : {}),
  };
}

const escapeJson = (s: string) => s.replace(/--/g, '-\\u002d');

/** Readable record for people in the tracker, plus the full record for Teamtrail. */
export function decisionComment(d: DecisionRecord): string {
  let rec: DecisionRecord = d;
  let json = escapeJson(JSON.stringify(rec));
  while (json.length > MAX_COMMENT - 4000 && rec.transcript.length) {
    rec = { ...rec, transcript: rec.transcript.slice(0, -Math.ceil(rec.transcript.length / 4)) };
    json = escapeJson(JSON.stringify(rec));
  }
  const lines = [
    `**Decision ${d.id}**${d.supersededBy ? ` · ~~superseded by ${d.supersededBy}~~` : ''} · ${d.decidedBy} · ${DECISION_SOURCES[d.source.kind]?.label ?? d.source.kind}${d.source.url ? ` · [${d.source.label ?? 'source'}](${d.source.url})` : ''}`,
    '',
    `> ${d.summary.replace(/\n/g, '\n> ')}`,
    ...(d.answer.trim() !== d.summary.trim() ? ['', d.answer.trim()] : []),
    '',
    `**Question:** ${d.question}`,
    ...(d.alternatives.length ? [`**Alternatives:** ${d.alternatives.join('; ')}`] : []),
    ...(d.rationale ? [`**Rationale:** ${d.rationale}`] : []),
    ...(d.supersedes ? [`**Supersedes:** ${d.supersedes}`] : []),
    '',
    `<!-- ${P}:decision ${json} -->`,
  ];
  return lines.join('\n');
}

export function parseDecisionComment(body: string): DecisionRecord | undefined {
  const m = body.replace(/\r\n/g, '\n').match(DECISION_RE);
  if (!m) return undefined;
  try {
    const d = JSON.parse(m[1]) as DecisionRecord;
    return d && typeof d.id === 'string'
      ? { ...d, alternatives: d.alternatives ?? [], participants: d.participants ?? [], transcript: d.transcript ?? [] }
      : undefined;
  } catch {
    return undefined;
  }
}

const TYPE_LABELS = new Map(ALL_TICKET_TYPES.map((t) => [label(t), t]));

export const typeFromLabels = (labels: string[]): TicketType =>
  labels.map((l) => TYPE_LABELS.get(l)).find(Boolean) ?? 'task';

export const ticketLabels = (type: TicketType, hitl?: boolean) => [
  label(type),
  ...(takesHitlLabel(type) && hitl ? [HITL_LABEL] : []),
];

export const mapLabels = (mode: MapMode) => [MAP_LABEL, ...(mode === 'plan-only' ? [PLAN_ONLY_LABEL] : [])];

/** Every label Teamtrail uses, with GitHub-style hex colours (calm palette; HITL is the one warning colour). */
export const ALL_LABELS: { name: string; color: string }[] = [
  { name: MAP_LABEL, color: '5b6b7a' },
  { name: PLAN_ONLY_LABEL, color: '7a6f5b' },
  { name: HITL_LABEL, color: 'd97706' },
  ...ALL_TICKET_TYPES.map((t) => ({ name: label(t), color: '4b5563' })),
];

export interface IssueParts {
  id: string;
  key: string;
  title: string;
  labels: string[];
  body: string | null | undefined;
  closed: boolean;
  closeReason?: 'completed' | 'not_planned';
  /** Assignee shown by the tracker itself (a person). */
  trackerAssignee?: string;
  blockedBy: string[];
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string | null;
}

export function ticketFromIssue(p: IssueParts): Ticket {
  const { text, meta } = splitBody(p.body);
  const type = typeFromLabels(p.labels);
  const status = TICKET_STATUSES.find((s) => s === meta.status);
  const verification = levelOf(meta.verification);
  const checks = Array.isArray(meta.checks) ? meta.checks.filter((c) => typeof c === 'string') : undefined;
  return {
    id: p.id,
    key: p.key,
    title: p.title,
    type,
    hitl: (takesHitlLabel(type) && p.labels.includes(HITL_LABEL)) || undefined,
    body: text,
    state: p.closed ? 'closed' : 'open',
    closeReason: p.closed ? (p.closeReason ?? 'completed') : undefined,
    assignee: meta.assignee ?? p.trackerAssignee,
    ...(status ? { status } : {}),
    ...(verification ? { verification } : {}),
    ...(checks ? { checks } : {}),
    ...(typeof meta.reviewOf === 'string' && meta.reviewOf ? { reviewOf: meta.reviewOf } : {}),
    ...(typeof meta.guide === 'string' && meta.guide ? { guide: meta.guide } : {}),
    blockedBy: p.blockedBy,
    comments: p.comments,
    createdAt: Date.parse(p.createdAt) || 0,
    updatedAt: Date.parse(p.updatedAt) || 0,
    closedAt: p.closed && p.closedAt ? Date.parse(p.closedAt) || undefined : undefined,
  };
}
