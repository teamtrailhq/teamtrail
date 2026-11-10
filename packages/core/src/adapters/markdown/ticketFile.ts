import { HITL_LABEL, label, takesHitlLabel } from '../../model/brand';
import { arr, iso, parseFront, str, time, writeFront, type Front } from '../../model/frontmatter';
import { levelOf, TICKET_STATUSES } from '../../model/lifecycle';
import { guardLines, oneLine, unguardLines } from '../../model/safeText';
import type { Comment, Ticket, TicketType } from '../../model/types';

/** The lines this file's reader takes for structure: where comments start, and each comment's author line. */
const COMMENTS = '## Comments\\s*$';
const IN_COMMENT = `${COMMENTS}|### `;

/** `<map-slug>/tickets/<n>.md`: frontmatter + body + "## Comments". */
export function parseTicket(md: string): Ticket {
  const { front, body } = parseFront(md);
  const [main, commentsRaw = ''] = body.split(/^## Comments\s*$/m);
  const comments: Comment[] = commentsRaw
    .split(/^### /m)
    .slice(1)
    .map((chunk, i) => {
      const nl = chunk.indexOf('\n');
      const head = chunk.slice(0, nl);
      const at = head.lastIndexOf(' @ ');
      return {
        id: `c${i}`,
        author: head.slice(0, at < 0 ? undefined : at).trim(),
        createdAt: (at >= 0 && Date.parse(head.slice(at + 3))) || 0,
        body: unguardLines(chunk.slice(nl + 1).trim(), IN_COMMENT),
      };
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
    body: unguardLines(main.trim(), COMMENTS),
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
  const comments = t.comments.length ? `\n\n## Comments\n\n${t.comments.map(commentBlock).join('\n\n')}` : '';
  return writeFront(front, guardLines(t.body, COMMENTS) + comments);
}

/** One comment: its author line, then its text, in which no line can start another comment or name an author. */
function commentBlock(c: Comment) {
  return `### ${oneLine(c.author)} @ ${iso(c.createdAt)}\n\n${guardLines(c.body, IN_COMMENT)}`;
}
