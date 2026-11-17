import type { LaidOutNode, ModelTier, SessionInfo } from '@teamtrail/core';
import { STATE_LABEL } from '../../lib';

/** The state part of a card, and the tone its chips take. */
export interface StatePart {
  text: string;
  tone: string;
}

/** The agent at work: its name, its model when known, its step when there's room. */
function agentPart(session: SessionInfo, step: boolean, model?: string): StatePart {
  const parts = [session.agent, model, step ? `${session.step}/${session.total}` : undefined];
  return { text: parts.filter(Boolean).join(' · '), tone: 'agent' };
}

/**
 * The state part of a card's meta line: waiting on your answer beats what else the queue holds on it beats stalled
 * beats held for the discovery brief beats waiting for a stronger model (model matching) beats the agent at work
 * (with its model, and its step when there's room) beats who holds it beats waiting for an agent to pick it up beats
 * the tickets it waits on beats the plain state.
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
  /** Room for the agent's step: there isn't when the line also carries a guide. */
  step: boolean;
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
  if (input.waiting) return { text: 'waiting on you', tone: 'urgent' };
  if (input.need) return { text: input.need, tone: 'urgent' };
  if (input.stalled) return { text: `stalled · ${assignee}`, tone: 'warn' };
  if (input.brief) return { text: 'waits on brief', tone: 'warn' };
  if (input.wait) return { text: `needs ${input.wait}`, tone: 'warn' };
  if (session) return agentPart(session, input.step, input.model);
  if (n.state === 'claimed') return { text: assignee ?? 'working', tone: 'agent' };
  if (n.state === 'verifying') return { text: 'checks running', tone: 'agent' };
  if (input.readyFor !== undefined) return { text: `waiting for an agent · ${input.readyFor}`, tone: 'wait' };
  if (input.waitsOn) return { text: input.waitsOn, tone: 'waits' };
  if (n.state === 'decided' && input.verified) return { text: 'verified', tone: 'verified' };
  return { text: STATE_LABEL[n.state], tone: '' };
}
