import type { TrackerAdapter } from '../adapters/adapter';
import { journalFile } from '../history/journalFile';
import type { AnswerVia } from '../model/answerVia';
import { OperationError } from '../planning/operations/operationError';
import { assertMayWaiveRule } from './assertMayWaiveRule';
import { ruleWaivers } from './ruleWaivers';

const TRAIL_LEAD = 'trail lead';

export interface UndoRuleWaiverRequest {
  mapId: string;
  ticketId: string;
  rule: string;
  /** The person, when the sign-in named them. */
  person?: string;
  /** How the trail lead gave it, set by the route (lookoutVia.ts). */
  via: AnswerVia;
  /** The request came from this machine (`fromThisMachine`). */
  local: boolean;
}

/**
 * Undoes the trail lead's "Go without R-1" for one ticket (waiveRule.ts): the waiver leaves the machine store, so the
 * rule's question needs its answer again from the ticket's next completion on. Attempts already made keep what they
 * recorded. The same refusals as the waiver (assertMayWaiveRule.ts); journaled and said on the ticket.
 */
export async function undoRuleWaiver(env: { adapter: TrackerAdapter; root: string }, r: UndoRuleWaiverRequest) {
  const snap = await env.adapter.loadMap(r.mapId);
  const t = snap.tickets.find((x) => x.id === r.ticketId);
  if (!t) throw new OperationError(`ticket ${r.ticketId} not found`);
  await assertMayWaiveRule(env.root, { ...r, key: t.key, doing: `Undoing Go without ${r.rule}` });
  const gone = ruleWaivers.remove(env.root, { mapId: r.mapId, ticketId: t.id, rule: r.rule });
  if (!gone) throw new OperationError(`${t.key} isn't going without ${r.rule}.`);
  const by = r.person ?? TRAIL_LEAD;
  journalFile(env.root).append({
    v: 1,
    kind: 'rule-waiver',
    at: Date.now(),
    mapId: r.mapId,
    ticketId: t.id,
    ticketKey: t.key,
    rule: gone.rule,
    action: 'undone',
    reason: gone.reason,
    actor: by,
    actorKind: 'trail lead',
  });
  await env.adapter.comment(r.mapId, t.id, TRAIL_LEAD, `**${gone.rule} asks again**\n\n${by} undid going without it.`);
  return { rule: gone.rule, waived: false };
}
