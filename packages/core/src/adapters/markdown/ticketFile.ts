import { HITL_LABEL, label, takesHitlLabel } from '../../model/brand';
import { arr, iso, parseFront, str, time, writeFront, type Front } from '../../model/frontmatter';
import { levelOf, TICKET_STATUSES } from '../../model/lifecycle';
import type { Comment, Ticket, TicketType } from '../../model/types';

/** `<map-slug>/tickets/<n>.md`: frontmatter + body + "## Comments". */
export function parseTicket(md: string): Ticket {
  const { front, body } = parseFront(md);
  const [main, commentsRaw = ''] = body.split(/^## Comments\s*$/m);
  const comments: Comment[] = commentsRaw
    .split(/^### /m)
    .slice(1)
    .map((chunk, i) => {
      const nl = chunk.indexOf('\n');
      const [author, at] = chunk.slice(0, nl).split(' @ ');
      return { id: `c${i}`, author: author.trim(), createdAt: Date.parse(at) || 0, body: chunk.slice(nl + 1).trim() };
    });
  const reason = str(front.close_reason);
  const status = TICKET_STATUSES.find((s) => s === str(front.status));
  const verification = levelOf(str(front.verification));
  return {
    id: str(front.id),
    key: `#${str(front.id)}`,
    title: str(front.title),
    type: (str(front.type) || 'task') as TicketType,
    hitl: arr(front.labels).includes(HITL_LABEL) || undefined,
    state: str(front.state) === 'closed' ? 'closed' : 'open',
    closeReason: reason === 'completed' || reason === 'not_planned' ? reason : undefined,
    assignee: str(front.assignee) || undefined,
    ...(status ? { status } : {}),
    ...(verification ? { verification } : {}),
    ...(front.checks !== undefined ? { checks: arr(front.checks) } : {}),
    ...(str(front.review_of) ? { reviewOf: str(front.review_of) } : {}),
    ...(str(front.guide) ? { guide: str(front.guide) } : {}),
    blockedBy: arr(front.blocked_by),
    body: main.trim(),
    comments,
    createdAt: time(front.created),
    updatedAt: time(front.updated),
    closedAt: time(front.closed) || undefined,
  };
}

export function serializeTicket(t: Ticket) {
  const front: Front = {
    id: t.id,
    title: t.title,
    type: t.type,
    labels: [label(t.type), ...(takesHitlLabel(t.type) && t.hitl ? [HITL_LABEL] : [])],
    state: t.state,
    close_reason: t.closeReason ?? '',
    assignee: t.assignee ?? '',
    ...(t.status ? { status: t.status } : {}),
    ...(t.verification ? { verification: t.verification } : {}),
    ...(t.checks ? { checks: t.checks } : {}),
    ...(t.reviewOf ? { review_of: t.reviewOf } : {}),
    ...(t.guide ? { guide: t.guide } : {}),
    blocked_by: t.blockedBy,
    created: iso(t.createdAt),
    updated: iso(t.updatedAt),
    ...(t.closedAt ? { closed: iso(t.closedAt) } : {}),
  };
  const comments = t.comments.length
    ? `\n\n## Comments\n\n${t.comments.map((c) => `### ${c.author} @ ${iso(c.createdAt)}\n\n${c.body}`).join('\n\n')}`
    : '';
  return writeFront(front, t.body + comments);
}
