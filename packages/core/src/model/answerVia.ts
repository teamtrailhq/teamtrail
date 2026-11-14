/**
 * How the human gave an answer to an agent's question, set by the code path that recorded it, never by its input:
 * - `lookout`: in the Lookout (the bridge's answer routes),
 * - `lookout-limited`: in the Lookout, by someone an embedding server's sign-in doesn't allow high-risk calls
 *   (signIn/externalSignIn.ts `highRisk: false`): it counts like a Slack answer,
 * - `slack`: in Slack (the connector),
 * - `chat`: in an agent's chat, passed on by that agent with answer_question.
 * It is signed with the answer (agents/agentAnswerSignature.ts), so it can't be relabelled.
 */
export type AnswerVia = 'lookout' | 'lookout-limited' | 'slack' | 'chat';

export const ANSWER_VIAS: readonly AnswerVia[] = ['lookout', 'lookout-limited', 'slack', 'chat'];

/**
 * Whether an answer given this way can stand in for the human at a gate (a decision that is theirs, a high-risk
 * call, a HITL close). Any local agent can call answer_question, one that was talked into answering its own
 * question included, so a chat answer only guides. An answer without a label was recorded before labels existed,
 * when chat answers were indistinguishable: it fails closed and counts as chat.
 */
export const approvesGates = (via: AnswerVia | undefined): boolean =>
  via === 'lookout' || via === 'lookout-limited' || via === 'slack';

/**
 * Whether an answer given this way can stand in for the human on a high-risk call (by the risk policy's category or
 * path rules). Slack answers reach this machine through Teamtrail's Scout service: a compromised service could make
 * one up, so on the riskiest calls only the Lookout's answer counts (policy/needsLookout.ts), and not that of a
 * caller its sign-in doesn't allow them (`lookout-limited`).
 */
export const approvesHighRisk = (via: AnswerVia | undefined): boolean => via === 'lookout';

/** Where the answer was given, for transcripts: "in claude-01's chat", or nothing for the Lookout and Slack. */
export const chatNote = (a: { via?: AnswerVia; chatOf?: string }): string | undefined =>
  a.via === 'chat' ? `in ${a.chatOf ?? 'an agent'}'s chat` : undefined;

/** How an answer was given, as the code path that delivers it knows; `via` is absent only on unlabelled ones. */
export interface AnswerHow {
  via?: AnswerVia;
  /** For `chat`: the agent whose chat it was given in. */
  chatOf?: string;
}

/** The label to keep with an answer (chat message, answered question): nothing for an unlabelled one. */
export function labelOf(how: AnswerHow): AnswerHow {
  if (!how.via) return {};
  return how.via === 'chat' && how.chatOf ? { via: how.via, chatOf: how.chatOf } : { via: how.via };
}
