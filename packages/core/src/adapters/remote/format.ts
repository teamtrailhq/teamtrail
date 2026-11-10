import { HITL_LABEL, MAP_LABEL, PLAN_ONLY_LABEL, label, takesHitlLabel } from '../../model/brand';
import { TICKET_STATUSES } from '../../model/lifecycle';
import { serializeMapBody } from '../../model/mapBody';
import { leadingMarker, marker, markerJson, trailingMarker } from '../../model/markerText';
import { guardMarkers, oneLine, unguardMarkers } from '../../model/safeText';
import {
  ALL_TICKET_TYPES,
  type Comment,
  type MapDoc,
  type MapMode,
  type Ticket,
  type TicketType,
} from '../../model/types';
import { settingsOf, type BodySettings } from './bodySettings';
import type { Settled } from './settingsInForce';
import { teammateActor, type Writer } from './writer';

/*
 * How Teamtrail state rides on a plain issue tracker, shared by GitHub and Linear:
 *   ticket type, HITL, plan-only    labels (brand.ts)
 *   claim, status, verification     `<!-- teamtrail:meta {"assignee":…,"status":…} -->` at the end of the issue body;
 *                                   a human assignee in the tracker counts as a claim too; on the trail issue,
 *                                   the trail's verification level and model matching
 *   comment author                  `<!-- teamtrail:author <id> -->` first line (the API user posts every comment)
 *   comment write id                `<!-- teamtrail:write <id> -->` next line, so a replayed queued write can tell it already landed
 *   decision record                 a comment on its ticket (or the trail) ending in `<!-- teamtrail:decision {json} -->`
 *                                   (decisionComment.ts)
 * A marker counts only where Teamtrail writes it, and only from an account trusted to write it (writer.ts).
 */
const META = 'meta';
const AUTHOR = 'author';
const WRITE = 'write';

export interface BodyMeta extends BodySettings {
  assignee?: string;
  status?: string;
  reviewOf?: string;
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

/** The settings a trail issue's marker holds. */
export const mapSettings = (m: Pick<MapDoc, 'verification' | 'modelMatching' | 'guides'>): BodySettings =>
  settingsOf({ verification: m.verification, modelMatching: m.modelMatching, guides: m.guides });

/** The settings a ticket's marker holds. */
export const ticketSettings = (t: Pick<Ticket, 'verification' | 'checks' | 'guide'>): BodySettings =>
  settingsOf({ verification: t.verification, checks: t.checks, guide: t.guide });

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

/**
 * A body as its text and the meta marker that ends it. Only that position counts: a marker further up is text,
 * and so is one whose JSON doesn't parse (a hand-edited marker is ignored rather than fatal).
 */
export function splitBody(raw: string | null | undefined): { text: string; meta: BodyMeta } {
  const body = (raw ?? '').replace(/\r\n/g, '\n');
  const found = trailingMarker(body, META);
  const meta = found ? parseMeta(found.payload) : undefined;
  return found && meta ? { text: found.before.trim(), meta } : { text: body.trim(), meta: {} };
}

function parseMeta(json: string): BodyMeta | undefined {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as BodyMeta) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A body as `writer` is trusted to have written it: an outsider's meta marker is part of the text, shown but
 * inert. Text Teamtrail guarded on the way in (ours, a teammate's) is unguarded on the way out.
 */
export function readBody(raw: string | null | undefined, writer: Writer): { text: string; meta: BodyMeta } {
  if (writer.kind === 'outsider') return { text: guardMarkers((raw ?? '').replace(/\r\n/g, '\n').trim()), meta: {} };
  const { text, meta } = splitBody(raw);
  return { text: unguardMarkers(text), meta };
}

export function joinBody(text: string, meta: BodyMeta): string {
  const clean = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== undefined && v !== ''));
  return Object.keys(clean).length ? `${text.trim()}\n\n${marker(META, markerJson(clean))}` : text.trim();
}

/**
 * A ticket's issue body: its text, in which nothing can open a marker of ours, then the real meta marker. (The
 * trail issue's text is the map body, which guards its own fields and carries real assumption markers.)
 */
export const ticketBody = (
  t: Pick<Ticket, 'body' | 'assignee' | 'status' | 'verification' | 'checks' | 'reviewOf' | 'guide'>,
) => joinBody(guardMarkers(t.body), ticketMeta(t));

const stripped = (s: string) => oneLine(s).replace(/-->/g, '');

export function authoredBody(author: string, body: string, writeId?: string) {
  const write = writeId ? `${marker(WRITE, writeId.replace(/\s|-->/g, ''))}\n` : '';
  return `${marker(AUTHOR, stripped(author))}\n${write}${guardMarkers(body)}`;
}

export interface TrackerComment {
  id: string;
  body: string;
  /** Who the tracker says posted it. */
  writer: Writer;
  createdAt: string | number;
}

const stamp = (at: string | number) => (typeof at === 'number' ? at : Date.parse(at) || 0);

/**
 * A tracker comment as a ticket comment. This account's comments carry who wrote them (an agent, the trail
 * lead) in an author marker; a teammate's marker names their agent or their human, shown with their tracker name;
 * an outsider's markers are part of what they wrote.
 */
export function readComment(c: TrackerComment): Comment {
  const raw = c.body.replace(/\r\n/g, '\n');
  const { id, writer } = c;
  const createdAt = stamp(c.createdAt);
  const name = writer.name || 'unknown';
  if (writer.kind === 'outsider') return { id, author: name, body: guardMarkers(raw.trim()), createdAt };
  const author = leadingMarker(raw, AUTHOR);
  const afterAuthor = author ? author.rest : raw;
  const write = leadingMarker(afterAuthor, WRITE);
  const body = unguardMarkers((write ? write.rest : afterAuthor).trim());
  if (writer.kind === 'teammate') {
    return { id, author: author ? teammateActor(author.payload, { ...writer, name }) : name, body, createdAt };
  }
  // Only this account's comments can be one of this machine's queued writes.
  const writeId = write && !/\s/.test(write.payload) ? { writeId: write.payload } : {};
  return { id, author: author ? author.payload : name, body, createdAt, ...writeId };
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
  /** Who last wrote the body, as far as the tracker says. */
  writer: Writer;
  /** The settings in force given the ones the body carries (settingsLedger.ts); missing: the body's own. */
  settle?: (found: BodySettings) => Settled;
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
  const { text, meta } = readBody(p.body, p.writer);
  const type = typeFromLabels(p.labels);
  const status = TICKET_STATUSES.find((s) => s === meta.status);
  const found = settingsOf({ ...meta });
  const settled = p.settle ? p.settle(found) : { use: found };
  const { verification, checks, guide } = settled.use;
  return {
    id: p.id,
    key: p.key,
    title: p.title,
    type,
    hitl: (takesHitlLabel(type) && p.labels.includes(HITL_LABEL)) || undefined,
    body: text,
    state: p.closed ? 'closed' : 'open',
    closeReason: p.closed ? (p.closeReason ?? 'completed') : undefined,
    assignee: (typeof meta.assignee === 'string' && meta.assignee) || p.trackerAssignee,
    ...(status ? { status } : {}),
    ...(verification ? { verification } : {}),
    ...(checks ? { checks } : {}),
    ...(typeof meta.reviewOf === 'string' && meta.reviewOf ? { reviewOf: meta.reviewOf } : {}),
    ...(guide ? { guide } : {}),
    ...(settled.unconfirmed ? { settingsUnconfirmed: true as const } : {}),
    blockedBy: p.blockedBy,
    comments: p.comments,
    createdAt: Date.parse(p.createdAt) || 0,
    updatedAt: Date.parse(p.updatedAt) || 0,
    closedAt: p.closed && p.closedAt ? Date.parse(p.closedAt) || undefined : undefined,
  };
}
