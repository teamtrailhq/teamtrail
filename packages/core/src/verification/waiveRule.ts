import type { TrackerAdapter } from '../adapters/adapter';
import { journalFile } from '../history/journalFile';
import type { AnswerVia } from '../model/answerVia';
import type { RuleWaiver } from '../model/diffRule';
import { oneLine } from '../model/safeText';
import { OperationError } from '../planning/operations/operationError';
import { assertMayWaiveRule } from './assertMayWaiveRule';
import { trustedChecks } from './checksApproval';
import { heldRulesStore } from './heldRulesStore';
import { ruleWaivers } from './ruleWaivers';

const TRAIL_LEAD = 'trail lead';
const MAX_REASON = 500;

export interface WaiveRuleRequest {
  mapId: string;
  ticketId: string;
  rule: string;
  reason: string;
  /** The person, when the sign-in named them. */
  person?: string;
  /** How the trail lead gave it, set by the route (lookoutVia.ts). */
  via: AnswerVia;
  /** The request came from this machine (`fromThisMachine`). */
  local: boolean;
}

/**
 * The trail lead's "Go without R-1" for one ticket: the rule's question needn't be answered on its completions. The
 * rule must be one of the approved config's that asks; its check, if any, still runs. Kept in the machine store
 * (ruleWaivers.ts), journaled, said on the ticket, and shown in its proof as a gap.
 */
export async function waiveRule(env: { adapter: TrackerAdapter; root: string }, r: WaiveRuleRequest) {
  const reason = oneLine(r.reason).slice(0, MAX_REASON);
  if (!reason) throw new OperationError('Say why it can go without the answer.');
  const snap = await env.adapter.loadMap(r.mapId);
  const t = snap.tickets.find((x) => x.id === r.ticketId);
  if (!t) throw new OperationError(`ticket ${r.ticketId} not found`);
  const rule = trustedChecks(env.root).config.config?.rules.find((x) => x.id === r.rule);
  if (!rule?.ask) throw new OperationError(`${r.rule} is not an approved rule that asks a question.`);
  await assertMayWaiveRule(env.root, { ...r, key: t.key, doing: 'Waiving a rule' });
  const w: RuleWaiver = {
    v: 1,
    mapId: r.mapId,
    ticketId: t.id,
    ticketKey: t.key,
    rule: rule.id,
    reason,
    by: r.person ?? TRAIL_LEAD,
    via: r.via,
    at: Date.now(),
  };
  ruleWaivers.add(env.root, w);
  journalFile(env.root).append({
    v: 1,
    kind: 'rule-waiver',
    at: w.at,
    mapId: w.mapId,
    ticketId: w.ticketId,
    ticketKey: w.ticketKey,
    rule: w.rule,
    action: 'waived',
    reason,
    actor: w.by,
    actorKind: 'trail lead',
  });
  const held = heldRulesStore.read(env.root, r.mapId, t.id);
  const left = held?.rules.filter((x) => x.id !== rule.id) ?? [];
  if (held && left.length) heldRulesStore.write(env.root, r.mapId, t.id, { ...held, rules: left });
  else heldRulesStore.clear(env.root, r.mapId, t.id);
  await env.adapter.comment(r.mapId, t.id, TRAIL_LEAD, `**Went without ${rule.id}**\n\n${reason}\n\nBy ${w.by}.`);
  return { rule: rule.id, waived: true };
}
