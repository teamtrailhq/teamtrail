import type { AnswerVia } from './answerVia';

/**
 * Why a call on something high risk is refused, given how the human gave it: from Slack, decide it in the Lookout;
 * from a Lookout caller not allowed high-risk calls (`lookout-limited`), ask someone who is.
 */
export function highRiskRefusal(which: string, via: AnswerVia | undefined): string {
  if (via === 'lookout-limited') return `${which} is high risk: ask someone allowed to make high-risk calls.`;
  return `${which} is high risk: decide it in the Lookout. Answers given in Slack don't count for it.`;
}
