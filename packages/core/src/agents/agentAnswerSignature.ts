import { machineId } from '../machine/machineId';
import { machineSign, machineSigned } from '../machine/machineKey';
import { ANSWER_VIAS } from '../model/answerVia';
import type { AgentAnswer } from './agentLink';

/*
 * Answers travel as files in the repo's folder, where the agent that asked can write too. So each one carries a
 * signature made with this machine's key, which lives outside the repo (machine/machineKey.ts): the Lookout's
 * bridge, the Slack connector and `answer_question` sign through `writeAgentAnswer`, and the asking process
 * delivers only what verifies. The project, session and question ids are signed too, so an answer can't be moved
 * to another question or another repo, and so is how it was given (`via`, `chatOf`), so a chat answer can't be
 * relabelled as the Lookout's.
 *
 * Limits: this stops a forger that can only write files in the repo, and a teammate's push. An agent that can read
 * files in the user's home can read machine.key and sign (`teamtrail connect` asks the agent's own settings to deny
 * it the config folder); any local agent can call answer_question, which is why chat answers never pass a gate.
 */
const fields = (root: string, a: Omit<AgentAnswer, 'sig'>) => {
  const signed = [machineId(root), a.sessionId, a.questionId, a.text, a.author, a.at];
  // Answers from before labels were signed without them, and still verify: as unlabelled, they count as chat. A
  // labelled answer is signed under another tag, so a label can't be added to, or dropped from, a signed answer.
  if (a.via === undefined) return ['answer', ...signed];
  return ['answer.via', ...signed, a.via, a.chatOf ?? ''];
};

/** Signs an answer for this project (the tracker folder `root`) on this machine. */
export const signAgentAnswer = (root: string, a: Omit<AgentAnswer, 'sig'>): AgentAnswer => ({
  ...a,
  sig: machineSign(fields(root, a)),
});

/**
 * Whether `a` was written by Teamtrail on this machine, for exactly this question of this project. Throws when the
 * machine key can't be read (machineAccess.ts says why): that is not the same as a forgery.
 */
export function agentAnswerSigned(root: string, a: AgentAnswer, q: { sessionId: string; questionId: string }): boolean {
  if (a.sessionId !== q.sessionId || a.questionId !== q.questionId) return false;
  if (typeof a.text !== 'string' || typeof a.author !== 'string' || typeof a.at !== 'number') return false;
  if (a.via !== undefined && !ANSWER_VIAS.includes(a.via)) return false;
  if (a.chatOf !== undefined && typeof a.chatOf !== 'string') return false;
  return machineSigned(fields(root, a), a.sig);
}
