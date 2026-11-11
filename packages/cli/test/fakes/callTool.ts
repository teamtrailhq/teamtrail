import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';

type Args = Record<string, unknown>;
type Result = { isError?: boolean; content: { text: string }[] };

/**
 * A tool call as the tests make them. Skipping discovery is the human's call (humanCall.ts), and most tests chart
 * a trail without it to get to what they test: there, the agent asks first and the trail lead says yes in the
 * Lookout, as they would. Tests about that gate itself call `start_trail` with a `questionId` or test the refusal
 * through `rawCall`.
 */
export async function callTool(client: Client, root: string, name: string, args: Args, timeout?: number) {
  const raw = (n: string, a: Args) =>
    client.callTool({ name: n, arguments: a }, undefined, timeout ? { timeout } : undefined) as Promise<Result>;
  if (name !== 'start_trail' || args.discovery !== false || args.questionId) return raw(name, args);
  const questionId = await trailLeadSaysSkip(root, raw);
  return raw(name, { ...args, questionId });
}

/** The agent asks to skip discovery; the trail lead answers yes in the Lookout. */
async function trailLeadSaysSkip(root: string, raw: (n: string, a: Args) => Promise<Result>) {
  const asked = raw('ask_human', {
    question: 'Skip discovery for this trail?',
    about: { kind: 'skip-discovery' },
    framing: true,
    waitSeconds: 30,
  });
  await answerInLookout(root, /skip discovery/, 'Yes, skip it');
  const r = await asked;
  if (r.isError) throw new Error(r.content[0].text);
  return (JSON.parse(r.content[0].text) as { questionId: string }).questionId;
}

/** The trail lead answers the waiting question whose stakes match, in the Lookout. */
export async function answerInLookout(root: string, stakes: RegExp, text: string) {
  for (let i = 0; i < 1500; i++) {
    for (const d of await readAgentDocs(root)) {
      const q = d.pending.find((p) => stakes.test(p.stakes ?? ''));
      if (q)
        return writeAgentAnswer(root, {
          sessionId: d.session.id,
          questionId: q.id,
          text,
          author: 'trail lead',
          via: 'lookout',
        });
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`no question waiting about ${stakes}`);
}
