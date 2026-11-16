import {
  checkGuideChecklists,
  guidesPayload,
  OperationError,
  resolveGuides,
  resolvedId,
  type AttemptGuide,
  type ChecklistAnswer,
  type GuideAnswers,
  type GuidePayload,
  type MapSnapshot,
  type ResolvedTicketGuide,
  type Ticket,
} from '@teamtrail/core';
import { listGuides, readLease, writeChecklist } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/** The checklist answers a completion gave, per guide, and the guides it was made under (for its attempt). */
export interface CheckedAnswers {
  guides: GuideAnswers[];
  attempt: AttemptGuide[];
}

/** A guide as the refusal hands it over: enough to act in it without another call. */
const handOver = (g: GuidePayload) =>
  [
    `Guide ${g.name} (${g.id} ${g.version}) was added to this ticket since you claimed it.`,
    g.instructions ? `Its instructions: ${g.instructions.trim()}` : '',
    `Its checklist: ${g.checklist.map((item, i) => `${i + 1}. ${item}`).join(' ')}`,
  ]
    .filter(Boolean)
    .join('\n');

/** Guides the ticket takes on now that the agent wasn't given at its claim (its lease says which it was given). */
function addedSinceClaim(ctx: AgentContext, at: { snap: MapSnapshot; ticket: Ticket }, list: ResolvedTicketGuide[]) {
  const given = readLease(ctx.root, at.snap.map.id, at.ticket.id)?.guides;
  if (!given) return [];
  return guidesPayload(list.filter((r) => !given.includes(resolvedId(r)))).guides;
}

/** Each guide as the attempt keeps it, with how much of its checklist got an answer. */
function attemptGuides(list: ResolvedTicketGuide[], answered: GuideAnswers[]): AttemptGuide[] {
  return list.map((r): AttemptGuide => {
    if (r.kind === 'disabled') return { id: r.id, via: r.via, disabled: true };
    const items = r.guide.checklist.length;
    const got = answered.find((a) => a.guide.id === r.guide.id)?.answers.length ?? 0;
    const checklist = items ? { checklist: { answered: got, items } } : {};
    return { id: r.guide.id, version: r.guide.version, via: r.via, ...checklist };
  });
}

/**
 * The checklists a completion must answer: every active guide of the ticket with a checklist, each checked on its
 * own (presence, not truth). Incomplete ones refuse the completion with what's missing, handing over any guide added
 * since the claim so the agent can comply. A disabled guide asks for no answers (its approved checks still run).
 */
export function checkedAnswers(
  ctx: AgentContext,
  input: { snap: MapSnapshot; ticket: Ticket; given?: ChecklistAnswer[] },
): CheckedAnswers | undefined {
  const list = resolveGuides(listGuides(ctx.root), { map: input.snap.map, ticket: input.ticket });
  if (!list.length) return undefined;
  const docs = list.flatMap((r) => (r.kind === 'active' ? [r.guide] : []));
  const c = checkGuideChecklists(docs, input.given);
  if (c.problems.length) {
    const handed = addedSinceClaim(ctx, input, list).map(handOver);
    throw new OperationError([...c.problems, ...handed].join('\n\n'));
  }
  return { guides: c.answered, attempt: attemptGuides(list, c.answered) };
}

/** Keeps a ticket's checklist answers next to its evidence, where the Lookout shows them. */
export async function keepAnswers(
  ctx: AgentContext,
  at: { snap: MapSnapshot; ticket: Ticket; checked?: CheckedAnswers },
) {
  if (!at.checked?.guides.length) return;
  writeChecklist(ctx.root, {
    v: 2,
    mapId: at.snap.map.id,
    ticketId: at.ticket.id,
    guides: at.checked.guides,
    by: await ctx.agentId(),
    at: Date.now(),
  });
}
