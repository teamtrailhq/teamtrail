import fs from 'node:fs/promises';
import path from 'node:path';
import { writeLocalJson } from '../lib/ensureLocalDir';
import { readJsonFile } from '../lib/jsonFile';
import { processAlive } from '../lib/processAlive';
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

/**
 * Deliver an answer to a question a session is waiting on, signed with this machine's key so the asking process
 * knows Teamtrail wrote it. Rejects questions that are not open.
 */
export function writeAgentAnswer(root: string, input: Omit<AgentAnswer, 'at'> & { at?: number }): AgentAnswer {
  const doc = readAgentDoc(root, agentPaths.session(input.sessionId));
  if (!doc) throw new AnswerError(`unknown session "${input.sessionId}"`);
  if (!doc.pending.some((q) => q.id === input.questionId))
    throw new AnswerError(`question "${input.questionId}" is not waiting for an answer`);
  if (!input.text.trim()) throw new AnswerError('answer is empty');
  const { sessionId, questionId, author } = input;
  const ans = signAgentAnswer(root, {
    sessionId,
    questionId,
    author,
    text: input.text.trim(),
    at: input.at ?? Date.now(),
  });
  writeLocalJson(root, agentPaths.answer(sessionId, questionId), ans);
  return ans;
}
