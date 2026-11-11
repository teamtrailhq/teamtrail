import { ATTENTION_KINDS, type AttentionKind } from '@teamtrail/core';
import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { text } from '../lineSafety';
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
        'Ask the human a question. It lands in the Lookout inbox (Waiting on you), ranked with everything else that needs them, and this call waits for the answer, up to waitSeconds (default 600; 50 for Codex). Returns answered=false with a questionId on timeout: call wait_for_answer to keep waiting. Set framing=true for the framing questions of a trail that does not exist yet. Set urgency honestly and ask related questions together. answeredVia says how the human answered: lookout or slack answers can back their decisions; a chat answer (passed on with answer_question) only guides.',
    },
    {
      question: text().min(1),
      suggestions: z.array(z.string()).optional().describe('Suggested replies, shown as one-click answers.'),
      waitSeconds: z.number().int().min(0).max(86_400).optional(),
      framing: z.boolean().optional(),
      category: riskCategory.optional(),
      categories: z
        .array(riskCategory)
        .max(8)
        .optional()
        .describe(
          'Every risk category the question is about, when it is more than one (a migration that also changes billing). An answer backs a decision only for the categories it was asked with.',
        ),
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
      about: z
        .discriminatedUnion('kind', [
          z.object({ kind: z.literal('skip-discovery') }),
          z.object({ kind: z.literal('mode'), mode: z.enum(['plan-only', 'plan+execute']) }),
          z.object({ kind: z.literal('destination'), destination: text().min(1) }),
        ])
        .optional()
        .describe(
          "A trail lead's setting you ask the human to change: skipping discovery (start_trail discovery=false), the trail's mode, or its destination (the exact new text). The Lookout and Slack show it with the question; once they answer there (not as fyi), that one change is yours to make.",
        ),
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
        "Pass on the human's answer to a waiting question, with their own words from this chat. Only use text the human gave you. It is delivered as given in your chat: it guides the agent that asked, but can't approve anything that needs the human (a high-risk call, a HITL ticket, a decision recorded as theirs); for that they answer in the Lookout or Slack.",
    },
    { questionId: z.string(), answer: text().min(1) },
    (a) => agent.answerQuestion(a),
  );
}
