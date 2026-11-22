import type { NodeState, RiskLevel } from '@teamtrail/core';
import { STATE_LABEL, TYPE_TEXT } from '../../lib/labels';
import type { ChipInput, TicketChip } from './types';

/** States an agent is moving: their chip takes the agent's tone, as on the map. */
const MOVING = new Set<NodeState>(['claimed', 'verifying']);
/** States held up until someone acts: amber. */
const HELD = new Set<NodeState>(['held', 'rework']);

const RISK_TEXT: Record<Exclude<RiskLevel, 'low'>, string> = { medium: 'medium risk', high: 'high risk' };

/**
 * The chips under a ticket's title, in the bubble and the full ticket alike, in the map card's words: its key and
 * type, whether it sets a new repo's project up, its state, the agent and model on it, whether its proof is
 * verified, and its risk when the policy rates it above low. Each says one thing; the sentences (who waits on whom,
 * since when) are the state line's.
 */
export function chipsOfTicket(c: ChipInput): TicketChip[] {
  const chips: TicketChip[] = [
    { kind: 'key', text: c.key },
    { kind: 'type', text: TYPE_TEXT[c.type] },
  ];
  if (c.setup)
    chips.push({
      kind: 'setup',
      text: 'setup',
      tip: 'Sets the project up and proposes the checks the trail is verified with',
    });
  chips.push(stateChip(c));
  if (c.agent) chips.push(...agentChips(c.agent));
  if (c.proof) chips.push(proofChip(c.proof));
  if (c.risk && c.risk.level !== 'low')
    chips.push({ kind: 'risk', text: RISK_TEXT[c.risk.level], tone: 'warn', tip: c.risk.reason });
  return chips;
}

/** Its state, or what needs the human on it, red, as on its map card. */
function stateChip(c: ChipInput): TicketChip {
  if (c.need) return { kind: 'state', text: c.need, tone: 'urgent' };
  return { kind: 'state', text: STATE_LABEL[c.state], tone: stateTone(c.state) };
}

function stateTone(state: NodeState): TicketChip['tone'] {
  if (MOVING.has(state)) return 'agent';
  return HELD.has(state) ? 'warn' : undefined;
}

function agentChips(a: NonNullable<ChipInput['agent']>): TicketChip[] {
  const tone = a.working ? 'agent' : undefined;
  const agent: TicketChip = { kind: 'agent', text: a.name, tone };
  if (!a.model) return [agent];
  return [agent, { kind: 'model', text: a.model, tip: a.modelId }];
}

function proofChip(p: NonNullable<ChipInput['proof']>): TicketChip {
  if (p.verified) return { kind: 'proof', text: 'verified', tone: 'verified', tip: 'Verified by Teamtrail' };
  return { kind: 'proof', text: 'not verified', tip: p.gap };
}
