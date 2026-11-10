import { HITL_LABEL, label, takesHitlLabel, BRAND } from '../../model/brand';
import { arr, iso, parseFront, str, time, writeFront, type Front } from '../../model/frontmatter';
import { levelOf, TICKET_STATUSES } from '../../model/lifecycle';
import { guardLines, guardMarkers, oneLine, unguardLines, unguardMarkers } from '../../model/safeText';
import type { Comment, Ticket, TicketType } from '../../model/types';

/*
 * The lines this file's reader takes for structure: where the comments start, and each comment's head,
 * `### <author> @ <ISO time>`. No text in the file, the body or a comment, may hold either; both are guarded
 * the same way. Since format 2 the comments also start at a delimiter only Teamtrail writes (the heading and a
 * marker under it), and the reader of such a file looks for nothing else, so the guard and the delimiter would
 * both have to fail for text to be read as a comment. Files without `format` are read the way they always were.
 */
const HEAD = '### [^\\n]* @ \\d{4}-\\d\\d-\\d\\dT';
const STRUCTURE = `## Comments\\s*$|${HEAD}`;
const MARK = `<!-- ${BRAND.labelPrefix}:comments -->`;
const DELIMITER = new RegExp(`^## Comments[ \\t]*\\n${MARK}[ \\t]*$`, 'm');
const HEADS = new RegExp(`^(?=${HEAD})### `, 'm');
const FORMAT = 2;

const guard = (text: string) => guardMarkers(guardLines(text, STRUCTURE));
const unguard = (text: string) => unguardLines(unguardMarkers(text), STRUCTURE);

/** The body and the raw comments of a file: at Teamtrail's own delimiter, or for older files the first heading. */
function splitComments(body: string, format: number): [string, string] {
  const at = (format >= FORMAT ? DELIMITER : /^## Comments\s*$/m).exec(body);
  return at ? [body.slice(0, at.index), body.slice(at.index + at[0].length)] : [body, ''];
}

/** `<map-slug>/tickets/<n>.md`: frontmatter + body + the comments. */
export function parseTicket(md: string): Ticket {
  const { front, body } = parseFront(md);
  const format = Number(str(front.format)) || 1;
  const [main, commentsRaw] = splitComments(body, format);
  const comments: Comment[] = commentsRaw
    .split(format >= FORMAT ? HEADS : /^### /m)
    .slice(1)
    .map((chunk, i) => {
      const nl = chunk.indexOf('\n');
      const head = chunk.slice(0, nl);
      const at = head.lastIndexOf(' @ ');
      return {
        id: `c${i}`,
        author: head.slice(0, at < 0 ? undefined : at).trim(),
        createdAt: (at >= 0 && Date.parse(head.slice(at + 3))) || 0,
        body: unguard(chunk.slice(nl + 1).trim()),
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
    body: unguard(main.trim()),
    comments,
    createdAt: time(front.created),
    updatedAt: time(front.updated),
    closedAt: time(front.closed) || undefined,
  };
}

export function serializeTicket(t: Ticket) {
  const front: Front = {
    id: t.id,
    format: String(FORMAT),
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
  const comments = t.comments.length ? `\n\n## Comments\n${MARK}\n\n${t.comments.map(commentBlock).join('\n\n')}` : '';
  return writeFront(front, guard(t.body) + comments);
}

/** One comment: its author line, then its text, in which no line can start another comment or name an author. */
function commentBlock(c: Comment) {
  return `### ${oneLine(c.author)} @ ${iso(c.createdAt)}\n\n${guard(c.body)}`;
}
