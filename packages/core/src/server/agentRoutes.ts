import type { IncomingMessage, ServerResponse } from 'node:http';
import { readAgentDocs, writeAgentAnswer } from '../agents/agentDocs';
import type { AgentAnswer } from '../agents/agentLink';
import { BadRequest, readJson, sendJson } from './http';

/** `/agents` routes over the session docs under `root`; false when none matches. */
export async function handleAgents(
  root: string,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname === '/agents' && req.method === 'GET') {
    sendJson(res, 200, { sessions: await readAgentDocs(root) });
    return true;
  }
  if (url.pathname === '/agents/answer' && req.method === 'POST') {
    const b = await readJson<Partial<AgentAnswer>>(req);
    for (const k of ['sessionId', 'questionId', 'text'] as const)
      if (typeof b[k] !== 'string' || !b[k]!.trim()) throw new BadRequest(`"${k}" is required`);
    // Both ids become file names under .agents/: only what Teamtrail itself hands out.
    for (const k of ['sessionId', 'questionId'] as const)
      if (!/^[\w.-]{1,120}$/.test(b[k]!) || b[k]!.includes('..')) throw new BadRequest(`"${k}" is not an id`);
    sendJson(
      res,
      201,
      writeAgentAnswer(root, {
        sessionId: b.sessionId!,
        questionId: b.questionId!,
        text: b.text!,
        author: typeof b.author === 'string' && b.author ? b.author : 'trail lead',
        // Given in the Lookout: this route says so, whatever the body says.
        via: 'lookout',
      }),
    );
    return true;
  }
  return false;
}
