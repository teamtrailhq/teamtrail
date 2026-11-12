import fs from 'node:fs/promises';
import path from 'node:path';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
import type { AnswerVia } from '../model/answerVia';
import { runningVersion } from '../model/runningVersion';
import { needsLookout } from '../policy/needsLookout';
import { signAgentAnswer } from './agentAnswerSignature';
import { SESSION_DOC_PATH, agentPaths, markDisconnected, type AgentAnswer, type AgentSessionDoc } from './agentLink';

/** One session doc by tracker-relative path, with dead processes shown as disconnected. */
export function readAgentDoc(root: string, rel: string): AgentSessionDoc | undefined {
  if (!SESSION_DOC_PATH.test(rel)) return undefined;
  const doc = readJsonFile<AgentSessionDoc>(path.join(root, rel));
  if (!doc || doc.v !== 1 || !doc.session) return undefined;
  return processAlive(doc.pid) ? doc : markDisconnected(doc);
}

/** Session docs under `root`, newest first: running ones plus those updated in the last `recentMs`. */
export async function readAgentDocs(
  root: string,
  opts: { recentMs?: number; limit?: number } = {},
): Promise<AgentSessionDoc[]> {
  const dir = path.join(root, agentPaths.sessions);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const since = Date.now() - (opts.recentMs ?? 24 * 3_600_000);
  const docs = names
    .filter((n) => n.endsWith('.json'))
    .map((n) => readAgentDoc(root, `${agentPaths.sessions}/${n}`))
    .filter((d): d is AgentSessionDoc => !!d && (d.session.status === 'running' || d.updatedAt >= since))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return docs.slice(0, opts.limit ?? 24);
}

export class AnswerError extends Error {}

/** An answer refused because the question is high risk and the answer wasn't given in the Lookout. */
export class LookoutOnlyAnswer extends AnswerError {}

const writer = () => {
  const v = runningVersion();
  return v ? { writer: v } : {};
};

/** What an answer's writer passes: `via` is the writer's own path (the bridge, Slack, answer_question). */
export type AnswerInput = Omit<AgentAnswer, 'at' | 'sig' | 'via'> & { via: AnswerVia; at?: number };

/**
 * Deliver an answer to a question a session is waiting on, signed with this machine's key so the asking process
 * knows Teamtrail wrote it, and how it was given. Rejects questions that are not open.
 */
export function writeAgentAnswer(root: string, input: AnswerInput): AgentAnswer {
  const doc = readAgentDoc(root, agentPaths.session(input.sessionId));
  if (!doc) throw new AnswerError(`unknown session "${input.sessionId}"`);
  const q = doc.pending.find((x) => x.id === input.questionId);
  if (!q) throw new AnswerError(`question "${input.questionId}" is not waiting for an answer`);
  // A high-risk question takes the human's word from the Lookout only: Slack's comes through the Scout service.
  if (input.via === 'slack' && needsLookout.question(root, q))
    throw new LookoutOnlyAnswer(`question "${input.questionId}" is high risk: answer it in the Lookout`);
  if (!input.text.trim()) throw new AnswerError('answer is empty');
  const { sessionId, questionId, author, via } = input;
  const chatOf = via === 'chat' && input.chatOf ? { chatOf: input.chatOf } : {};
  const ans = signAgentAnswer(root, {
    sessionId,
    questionId,
    author,
    text: input.text.trim(),
    at: input.at ?? Date.now(),
    via,
    ...chatOf,
    ...writer(),
  });
  writeLocalJson(root, agentPaths.answer(sessionId, questionId), ans);
  return ans;
}
