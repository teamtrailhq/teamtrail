import type { Comment, DecisionRecord, MapSnapshot, Ticket } from '../../../model/types';
import { ticketFromIssue } from '../format';
import { mapFromIssue, readIssueComments } from '../issueMapping';
import type { SettingsGate } from '../settingsLedger';
import { bodyWriter, commentWriter } from './githubWriter';
import type { GqlIssue } from './schema';

export interface GitHubTrail {
  snap: MapSnapshot;
  decisions: DecisionRecord[];
  /** Issue number → REST id, for every issue read. */
  issueIds: [string, number][];
  /** `<trail>/<D-n>` → id of the comment holding the record. */
  decisionComments: [string, number][];
}

export interface TrailReader {
  /** The login behind the token: only its comments and bodies are this machine's own. */
  viewer: string | undefined;
  gate: SettingsGate;
}

const isNumber = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) > 0;

/** A trail issue (with its sub-issues, as `TRAIL_QUERY` returns it) as a map snapshot. */
export function readTrail(mapId: string, root: GqlIssue, { viewer, gate }: TrailReader): GitHubTrail {
  const decisions: DecisionRecord[] = [];
  const decisionComments: [string, number][] = [];
  const issueIds: [string, number][] = [[mapId, root.databaseId]];
  const comments = (issue: GqlIssue): Comment[] =>
    readIssueComments(
      mapId,
      issue.comments.nodes.map((c) => ({
        id: c.databaseId,
        body: c.body,
        writer: commentWriter(viewer, c),
        createdAt: c.createdAt,
      })),
      (d, commentId) => {
        decisions.push(d);
        decisionComments.push([`${mapId}/${d.id}`, commentId]);
      },
    );
  comments(root);
  // An issue number is the ticket's id everywhere after this (paths, branches): anything else is dropped.
  const subs = (root.subIssues?.nodes ?? []).filter((s) => isNumber(s.number));
  const siblings = new Set(subs.map((s) => String(s.number)));
  const tickets: Ticket[] = subs.map((s) => {
    issueIds.push([String(s.number), s.databaseId]);
    const writer = bodyWriter(viewer, s);
    return ticketFromIssue({
      id: String(s.number),
      key: `#${s.number}`,
      title: s.title,
      labels: s.labels.nodes.map((l) => l.name),
      body: s.body,
      writer,
      settle: gate.settle(String(s.number), writer),
      closed: s.state === 'CLOSED',
      closeReason: s.stateReason === 'NOT_PLANNED' || s.stateReason === 'DUPLICATE' ? 'not_planned' : 'completed',
      trackerAssignee: s.assignees.nodes[0]?.login,
      blockedBy: (s.blockedBy?.nodes ?? []).map((b) => String(b.number)).filter((n) => siblings.has(n)),
      comments: comments(s),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      closedAt: s.closedAt,
    });
  });
  const writer = bodyWriter(viewer, root);
  const map = mapFromIssue({
    id: mapId,
    key: `#${root.number}`,
    title: root.title,
    labels: root.labels.nodes.map((l) => l.name),
    body: root.body,
    writer,
    settle: gate.settle(mapId, writer),
    createdAt: root.createdAt,
    updatedAt: root.updatedAt,
  });
  gate.save();
  return {
    snap: { map, tickets: tickets.sort((a, b) => a.createdAt - b.createdAt || Number(a.id) - Number(b.id)) },
    decisions,
    issueIds,
    decisionComments,
  };
}
