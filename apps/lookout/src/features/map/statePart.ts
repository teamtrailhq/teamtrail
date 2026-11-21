import type { LaidOutNode, ModelTier, SessionInfo } from '@teamtrail/core';
import { STATE_LABEL } from '../../lib';

/** The state part of a card, and the tone its chips take. */
export interface StatePart {
  text: string;
  tone: string;
}

/** The agent at work: its model when known (the step track shows its step; the bubble names the agent), else its name. */
function agentPart(session: SessionInfo, model?: string): StatePart {
  return { text: model ?? session.agent, tone: 'agent' };
}

/**
 * The state part of a card's label line: asking you beats what else the queue holds on it beats stalled beats held
 * for the discovery brief beats waiting for a stronger model (model matching) beats the agent at work (its model)
 * beats who holds it beats ready for an agent (and for how long) beats the tickets it waits on beats the plain state.
 */
export function statePart(input: {
  n: LaidOutNode;
  session?: SessionInfo;
  waiting: boolean;
  /** What the queue holds on it, in words (cardNeedText). */
  need?: string;
  stalled?: boolean;
  /** Ready, but the discovery gate holds it until the trail lead accepts the brief. */
  brief?: boolean;
  wait?: ModelTier;
  /** The agent's model, short ("Sonnet 4.5"), when it fits. */
  model?: string;
  /** Waiting for an agent to pick it up: for how long ("2m"). */
  readyFor?: string;
  /** Not started: what it waits on ("waits on #22, #8"). */
  waitsOn?: string;
  /** Done: whether its proof is verified. */
  verified?: boolean;
}): StatePart {
  const { n, session } = input;
  const assignee = n.ticket.assignee;
  if (input.waiting) return { text: 'asks you', tone: 'urgent' };
  if (input.need) return { text: input.need, tone: 'urgent' };
  if (input.stalled) return { text: `stalled · ${assignee}`, tone: 'warn' };
  if (input.brief) return { text: 'waits on brief', tone: 'warn' };
  if (input.wait) return { text: `needs ${input.wait}`, tone: 'warn' };
  if (session) return agentPart(session, input.model);
  if (n.state === 'claimed') return { text: assignee ?? 'working', tone: 'agent' };
  if (n.state === 'verifying') return { text: 'checks running', tone: 'agent' };
  if (input.readyFor !== undefined) return { text: `ready ${input.readyFor}`, tone: 'wait' };
  if (input.waitsOn) return { text: input.waitsOn, tone: 'waits' };
  if (n.state === 'decided' && input.verified) return { text: 'verified', tone: 'verified' };
  return { text: STATE_LABEL[n.state], tone: '' };
}
