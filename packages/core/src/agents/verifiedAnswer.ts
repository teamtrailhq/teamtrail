import type { AnswerHow } from '../model/answerVia';
import { checkAgentAnswer } from './agentAnswerSignature';
import type { AgentAnswer } from './agentLink';
import type { AnswerFile } from './answerFiles';

/** A question as the asking process holds it. */
export type Asked = { id: string; sessionId: string; agent: string };

/** An answer this machine signed for the question, and how it was given as far as that verifies. */
export type Signed = { kind: 'signed'; ans: AgentAnswer; how: AnswerHow };

export type Verified = Signed | { kind: 'skip' } | { kind: 'unreadable' } | { kind: 'forged' };

/**
 * One answer file checked against the question it sits under: signed here (`signed`), not JSON (`skip`), not
 * Teamtrail's on this machine (`forged`), or not checkable because the machine key can't be read (`unreadable`).
 */
export function verified(root: string, f: AnswerFile, q: Asked): Verified {
  if (!f.ans) return { kind: 'skip' };
  try {
    const check = checkAgentAnswer(root, f.ans, { sessionId: q.sessionId, questionId: q.id });
    return check.kind === 'signed' ? { kind: 'signed', ans: f.ans, how: check.how } : check;
  } catch {
    return { kind: 'unreadable' };
  }
}
