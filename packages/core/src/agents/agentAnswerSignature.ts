import { machineId } from '../machine/machineId';
import { machineSign, machineSigned } from '../machine/machineKey';
import type { AgentAnswer } from './agentLink';

/*
 * Answers travel as files in the repo's folder, where the agent that asked can write too. So each one carries a
 * signature made with this machine's key, which lives outside the repo (machine/machineKey.ts): the Lookout's
 * bridge, the Slack connector and `answer_question` sign through `writeAgentAnswer`, and the asking process
 * delivers only what verifies. The project, session and question ids are signed too, so an answer can't be moved
 * to another question or another repo.
 *
 * Limits: this stops a forger that can only write files in the repo, and a teammate's push. An agent that can read
 * files in the user's home can read machine.key and sign; any local agent can call answer_question.
 */
const fields = (root: string, a: Omit<AgentAnswer, 'sig'>) => [
  'answer',
  machineId(root),
  a.sessionId,
  a.questionId,
  a.text,
  a.author,
  a.at,
];

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
  return machineSigned(fields(root, a), a.sig);
}
