import { ATTENTION_KINDS, type AttentionKind } from '@teamtrail/core';
import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { type DefineTool, riskCategory, waitControl } from '../toolKit';

const ATTENTION_KIND_VALUES = ATTENTION_KINDS as [AttentionKind, ...AttentionKind[]];

/** Human-in-the-loop tools: ask, wait, inbox, answer. */
export function registerHitlTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'ask_human',
    {
      human: 'none',
      title: 'Ask the human',
      description:
        'Ask the human a question. It lands in the Lookout inbox (Waiting on you), ranked with everything else that needs them, and this call waits for the answer, up to waitSeconds (default 600; 50 for Codex). Returns answered=false with a questionId on timeout: call wait_for_answer to keep waiting. Set framing=true for the framing questions of a trail that does not exist yet. Set urgency honestly and ask related questions together.',
    },
    {
      question: z.string().min(1),
      suggestions: z.array(z.string()).optional().describe('Suggested replies, shown as one-click answers.'),
      waitSeconds: z.number().int().min(0).max(86_400).optional(),
      framing: z.boolean().optional(),
      category: riskCategory.optional(),
      urgency: z
        .enum(['blocking', 'soon', 'fyi'])
        .optional()
        .describe(
          'How much you need the answer. blocking: only when you can do no useful work until answered. soon (default): you keep working on other tickets meanwhile. fyi: whenever the human has a moment.',
        ),
      blocks: z
        .array(z.string())
        .optional()
        .describe('Ticket refs (#4 or ids) that cannot move until this is answered; they rank the question higher.'),
    },
    (a, extra) => agent.ask(a, waitControl(extra)),
  );

  tool(
    'wait_for_answer',
    {
      human: 'none',
      title: 'Wait for an answer',
      description: 'Keep waiting for the answer to a question asked with ask_human.',
      readOnly: true,
    },
    { questionId: z.string(), waitSeconds: z.number().int().min(0).max(86_400).optional() },
    (a, extra) => agent.waitForAnswer(a, waitControl(extra)),
  );

  tool(
    'list_inbox',
    {
      human: 'none',
      title: 'Inbox',
      description:
        'Questions from every connected agent that are waiting on the human, oldest first, plus `attention`: everything that needs the human (questions, approvals, held tickets, PR/CI flags, stalled claims, HITL tickets, knowledge to review, briefs), ranked best first, each with plain reasons.',
      readOnly: true,
    },
    {
      kinds: z
        .array(z.enum(ATTENTION_KIND_VALUES))
        .optional()
        .describe('Only these attention kinds, e.g. ["question", "approval"].'),
    },
    (a) => agent.inbox(a),
  );

  tool(
    'answer_question',
    {
      human: {
        kind: 'acts',
        why: "Answering is the trail lead's: they answer in the Lookout or Slack.",
      },
      title: 'Answer a question',
      description:
        "Answer a waiting question on the human's behalf, with the human's own words from this chat. Only use text the human gave you.",
    },
    { questionId: z.string(), answer: z.string().min(1) },
    (a) => agent.answerQuestion(a),
  );
}
