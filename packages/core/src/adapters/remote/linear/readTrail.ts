import type { DecisionRecord, MapSnapshot, Ticket } from '../../../model/types';
import { ticketFromIssue } from '../format';
import { mapFromIssue, readIssueComments } from '../issueMapping';
import type { SettingsGate } from '../settingsLedger';
import type { Writer } from '../writer';
import { isClosed, type LComment, type LIssue } from './schema';

/** Receives each decision record found in comments, with the id of its comment. */
export type DecisionFound = (d: DecisionRecord, commentId: string) => void;

export interface TrailReader {
  /** The id of the user behind the key: only their comments are this machine's own. */
  viewer: string | undefined;
  /** Missing for an issue this machine just created: its settings are its own. */
  gate?: SettingsGate;
  found: DecisionFound;
}

/** Linear ids are UUIDs; an id is used in paths and branch names after this, so anything else is dropped. */
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const isId = (id: unknown): id is string => typeof id === 'string' && ID.test(id);

/**
 * Who a comment's markers belong to. Only its author can edit a Linear comment, so the user is enough: the key's
 * own user, another member of the workspace (a teammate), or nobody (an integration: an outsider).
 */
function commentWriter(viewer: string | undefined, c: LComment): Writer {
  if (!c.user) return { kind: 'outsider', name: '' };
  const self = !!viewer && c.user.id === viewer;
  return { kind: self ? 'self' : 'teammate', name: c.user.displayName };
}

/**
 * Anyone in the workspace can edit a description and Linear doesn't say who did last, so a description is a
 * teammate's at best: its claim and status are taken, its settings only when this machine put or accepted them.
 */
const DESCRIPTION: Writer = { kind: 'teammate', name: '' };
const OWN: Writer = { kind: 'self', name: '' };

const comments = (mapId: string, issue: LIssue, r: TrailReader) =>
  readIssueComments(
    mapId,
    [...issue.comments.nodes]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => ({ id: c.id, body: c.body, writer: commentWriter(r.viewer, c), createdAt: c.createdAt })),
    r.found,
  );

/** A sub-issue as a ticket; `siblings` are the trail's other sub-issues, the only blockers that count. */
export function linearTicket(mapId: string, i: LIssue, siblings: Set<string>, r: TrailReader): Ticket {
  const writer = r.gate ? DESCRIPTION : OWN;
  return ticketFromIssue({
    id: i.id,
    key: i.identifier,
    title: i.title,
    labels: i.labels.nodes.map((l) => l.name),
    body: i.description,
    writer,
    settle: r.gate?.settle(i.id, writer),
    closed: isClosed(i.state),
    closeReason: i.state.type === 'canceled' ? 'not_planned' : 'completed',
    trackerAssignee: i.assignee?.displayName,
    blockedBy: (i.inverseRelations?.nodes ?? [])
      .filter((x) => x.type === 'blocks' && siblings.has(x.issue.id))
      .map((x) => x.issue.id),
    comments: comments(mapId, i, r),
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    closedAt: i.completedAt ?? i.canceledAt,
  });
}

/** A trail issue (with its children, as `TRAIL_QUERY` returns it) as a map snapshot. */
export function readTrail(
  mapId: string,
  root: LIssue,
  reader: TrailReader & { gate: SettingsGate },
): { snap: MapSnapshot; decisions: DecisionRecord[] } {
  const decisions: DecisionRecord[] = [];
  const r: TrailReader = {
    ...reader,
    found: (d, commentId) => {
      decisions.push(d);
      reader.found(d, commentId);
    },
  };
  comments(mapId, root, r);
  const kids = (root.children?.nodes ?? []).filter((k) => isId(k.id));
  const siblings = new Set(kids.map((k) => k.id));
  const map = mapFromIssue({
    id: root.id,
    key: root.identifier,
    title: root.title,
    labels: root.labels.nodes.map((l) => l.name),
    body: root.description,
    writer: DESCRIPTION,
    settle: reader.gate.settle(root.id, DESCRIPTION),
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
  });
  const tickets = kids.map((k) => linearTicket(mapId, k, siblings, r)).sort((a, b) => a.createdAt - b.createdAt);
  reader.gate.save();
  return { snap: { map, tickets }, decisions };
}
