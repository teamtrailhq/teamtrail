import { closesQuestion } from '../model/answerVia';
import { checkAgentAnswer } from './agentAnswerSignature';
import type { AgentAnswer, FirstAnswer } from './agentLink';
import { answerFiles, type AnswerFile } from './answerFiles';

/**
 * Whether an answer file is this machine's answer to exactly this question: only those take a place in line. One
 * that doesn't verify (or can't be checked, when the key can't be read) is passed over.
 */
export function signedFor(root: string, q: { sessionId: string; questionId: string }) {
  return (f: AnswerFile): boolean => {
    if (!f.ans) return false;
    try {
      return checkAgentAnswer(root, f.ans, q).kind === 'signed';
    } catch {
      return false;
    }
  };
}

/** The answer that came first, as whoever gave a later one is told of it: how it was given as far as that verifies. */
export function firstAnswerOf(root: string, a: AgentAnswer): FirstAnswer {
  const check = checkAgentAnswer(root, a, a);
  const how = check.kind === 'signed' ? check.how : {};
  return { text: a.text, author: a.author, at: a.at, ...how };
}

/**
 * The answer the asking process uses for a question, by the rule it says it follows (agentLink.ts `chatGuides`):
 * the first in line that verifies and wasn't given in a chat, or, for a process from before that, the first in line
 * that verifies, whoever gave it. Undefined while none is: a chat answer then only guides.
 */
export function usedAnswer(root: string, q: { sessionId: string; questionId: string }, chatGuides: boolean) {
  for (const f of answerFiles(root, q.sessionId, q.questionId)) {
    if (!f.ans) continue;
    let check;
    try {
      check = checkAgentAnswer(root, f.ans, q);
    } catch {
      continue;
    }
    if (check.kind === 'signed' && (!chatGuides || closesQuestion(check.how.via))) return f;
  }
  return undefined;
}
