import type { LaidOutNode, ModelTier, SessionInfo } from '@teamtrail/core';
import { STATE_LABEL } from '../../lib';

/**
 * The state part of a card's meta line: waiting on you beats stalled beats waiting for a stronger model (model
 * matching) beats the agent at work (and its step, when there's room) beats who holds it beats the plain state.
 */
export function statePart(input: {
  n: LaidOutNode;
  session?: SessionInfo;
  waiting: boolean;
  stalled?: boolean;
  wait?: ModelTier;
  /** Room for the agent's step: there isn't when the line also carries a guide. */
  step: boolean;
  /** Done: whether its proof is verified. */
  verified?: boolean;
}) {
  const { n, session } = input;
  const assignee = n.ticket.assignee;
  if (input.waiting) return { text: 'waiting on you', tone: 'urgent' };
  if (input.stalled) return { text: `stalled · ${assignee}`, tone: 'warn' };
  if (input.wait) return { text: `needs ${input.wait}`, tone: 'warn' };
  if (session && input.step) return { text: `${session.agent} · step ${session.step}/${session.total}`, tone: 'agent' };
  if (session) return { text: session.agent, tone: 'agent' };
  if (n.state === 'claimed') return { text: assignee ?? 'working', tone: 'agent' };
  if (n.state === 'verifying') return { text: 'checks running', tone: 'agent' };
  if (n.state === 'decided' && input.verified) return { text: 'verified', tone: 'verified' };
  return { text: STATE_LABEL[n.state], tone: '' };
}
