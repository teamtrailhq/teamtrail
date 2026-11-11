import { machineId } from '../machine/machineId';
import { machineSign, machineSigned } from '../machine/machineKey';
import { ANSWER_VIAS, type AnswerHow } from '../model/answerVia';
import type { AgentAnswer } from './agentLink';

/*
 * Answers travel as files in the repo's folder, where the agent that asked can write too. So each one carries a
 * signature made with this machine's key, which lives outside the repo (machine/machineKey.ts): the Lookout's
 * bridge, the Slack connector and `answer_question` sign through `writeAgentAnswer`, and the asking process
 * delivers only what verifies. The project, session and question ids are signed too, so an answer can't be moved
 * to another question or another repo.
 *
 * Two signatures, so a Lookout and an agent on different versions still understand each other:
 * - `sig`: the answer itself, exactly as every version has signed it. An older agent verifies this one and gets
 *   the answer; nothing newer is needed to deliver it.
 * - `sigVia`: the answer and how it was given (`via`, `chatOf`). Only with it does the label count; without it (an
 *   older writer, or a label changed or added since) the answer is unlabelled, and unlabelled counts as chat:
 *   it guides, and approves no gate (model/answerVia.ts). So a chat answer can't be relabelled as the Lookout's.
 *
 * Limits: this stops a forger that can only write files in the repo, and a teammate's push. An agent that can read
 * files in the user's home can read machine.key and sign (`teamtrail connect` asks the agent's own settings to deny
 * it the config folder); any local agent can call answer_question, which is why chat answers never pass a gate.
 */
type Unsigned = Omit<AgentAnswer, 'sig' | 'sigVia'>;

const answerFields = (root: string, a: Unsigned) => [
  'answer',
  machineId(root),
  a.sessionId,
  a.questionId,
  a.text,
  a.author,
  a.at,
];
const labelFields = (root: string, a: Unsigned) => [
  'answer.via',
  ...answerFields(root, a).slice(1),
  a.via ?? '',
  a.chatOf ?? '',
];

/** Signs an answer for this project (the tracker folder `root`) on this machine; the label too, when it has one. */
export function signAgentAnswer(root: string, a: Unsigned): AgentAnswer {
  const sig = machineSign(answerFields(root, a));
  return a.via === undefined ? { ...a, sig } : { ...a, sig, sigVia: machineSign(labelFields(root, a)) };
}

/** An answer file checked: not Teamtrail's (forged, or moved), or Teamtrail's with the label that verified. */
export type AnswerCheck = { kind: 'forged' } | { kind: 'signed'; how: AnswerHow };

/**
 * Whether `a` was written by Teamtrail on this machine, for exactly this question of this project, and how it was
 * given as far as that is signed too. Throws when the machine key can't be read (machineAccess.ts says why): that
 * is not the same as a forgery.
 */
export function checkAgentAnswer(
  root: string,
  a: AgentAnswer,
  q: { sessionId: string; questionId: string },
): AnswerCheck {
  if (a.sessionId !== q.sessionId || a.questionId !== q.questionId) return { kind: 'forged' };
  if (typeof a.text !== 'string' || typeof a.author !== 'string' || typeof a.at !== 'number') return { kind: 'forged' };
  if (!machineSigned(answerFields(root, a), a.sig)) return { kind: 'forged' };
  const known =
    a.via !== undefined && ANSWER_VIAS.includes(a.via) && (a.chatOf === undefined || typeof a.chatOf === 'string');
  if (!known || !machineSigned(labelFields(root, a), a.sigVia)) return { kind: 'signed', how: {} };
  return { kind: 'signed', how: a.via === 'chat' ? { via: a.via, chatOf: a.chatOf } : { via: a.via } };
}
