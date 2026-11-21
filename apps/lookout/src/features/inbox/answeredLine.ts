import type { ChatMessage } from '@teamtrail/core';

const WHERE = { lookout: 'in the Lookout', 'lookout-limited': 'in the Lookout', slack: 'in Slack' } as const;

/**
 * The green line under an answer of the human's that counts as their word: it answers a question, was given in
 * the Lookout or Slack, and was the one used ("Answered · in the Lookout"). Nothing for a chat answer (guidance),
 * one not used, or one from before answers were labelled. Pure.
 */
export function answeredLine(m: ChatMessage): string[] | undefined {
  if (m.from !== 'human' || !m.answers || m.notUsed || m.guidance) return undefined;
  if (!m.via || m.via === 'chat') return undefined;
  return ['Answered', WHERE[m.via]];
}
