import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { text } from '../lineSafety';
import { checklistAnswers, type DefineTool, trail, riskCategory, riskPaths, ticket, waitControl } from '../toolKit';

const CHECKS_WAIT = 'Waiting for the verification checks';
const completion = {
  trail,
  ticket: ticket.optional(),
  resolution: text().min(1).describe('The decision or what was done, in full.'),
  summary: z.string().optional().describe('One line for the Logbook. Default: first sentence of the resolution.'),
  rationale: text().optional(),
  alternatives: z.array(z.string()).optional(),
  postTranscript: z.boolean().optional().describe('Also post the question/answer transcript as a ticket comment.'),
  questionId: z
    .string()
    .optional()
    .describe(
      "When the human decided this: the ask_human question they answered in the Lookout or Slack, asked on this ticket. Default: your latest unused one on it. The record then keeps their answer as given. An answer given in an agent's chat is refused.",
    ),
  category: riskCategory.optional(),
  paths: riskPaths.optional(),
  assumes: z
    .array(z.string())
    .optional()
    .describe('Ids (S-<n>) of the trail assumptions this decision relies on, so it is revisited if one fails.'),
  criteria: z
    .array(
      z.object({
        id: z.string().describe('AC-<n>'),
        evidence: z
          .string()
          .describe(
            'check:<name> (run and verified here), test:<name>, command:<cmd> or pr (recorded as claimed, not verified), or manual (the human signs off).',
          ),
        note: z.string().optional(),
      }),
    )
    .optional()
    .describe('Evidence for each acceptance criterion of the ticket. Every criterion needs one.'),
  checklist: checklistAnswers,
  noCodeReason: z
    .string()
    .optional()
    .describe('When verified and no files changed: why none had to (otherwise no changes is flagged).'),
  waitSeconds: z
    .number()
    .int()
    .min(0)
    .max(3600)
    .optional()
    .describe('When checks run: how long to wait for them (default 600; 50 for Codex).'),
};

/** Tools used while working a ticket: progress, closing it, decisions. */
export function registerWorkTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'report_progress',
    {
      human: 'none',
      title: 'Report progress',
      description:
        'Show progress live in the Lookout: a step of the session procedure (work: Load trail, Claim, Resolve, Record, Update plan; research: Claim, Investigate, Record), a log line, a chat message to the human. Token and cost usage is read from Claude Code and Codex session logs; pass inputTokens/outputTokens/costUsd only when your client has no such log and you actually know them (since your last report).',
    },
    {
      message: z.string().optional().describe('Log line, or detail for the step.'),
      step: z.union([z.string(), z.number().int()]).optional(),
      level: z.enum(['info', 'ok', 'warn', 'alert']).optional(),
      say: text().optional().describe('Message shown in the session conversation.'),
      inputTokens: z.number().nonnegative().optional().describe('Input tokens used since the last report.'),
      outputTokens: z.number().nonnegative().optional(),
      costUsd: z.number().nonnegative().optional().describe('Spend in USD since the last report.'),
    },
    (a) => agent.report(a),
  );

  tool(
    'close_ticket',
    {
      human: 'none',
      title: 'Close a ticket',
      description:
        'Resolve a ticket (default: the one you claimed): posts the resolution, closes it, records a DecisionRecord (with the HITL transcript of this session) and unblocks dependants. When the ticket lists `verification` checks, completing is a claim: the checks run first, and the result says done, rework (with the failing output to fix) or verifying (still running). outcome "out_of_scope" never cancels it: it becomes a rule-out proposal the human approves or dismisses.',
    },
    { ...completion, outcome: z.enum(['completed', 'out_of_scope']).optional() },
    (a, extra) => agent.closeTicket(a, waitControl(extra, CHECKS_WAIT)),
  );

  tool(
    'report_completion',
    {
      human: 'none',
      title: 'Report completion',
      description:
        "Claim a ticket is done (default: the one you claimed). Without verification it closes like close_ticket. With verification, the repo's checks run and the result is done, rework (fix the `feedback`, then claim and complete again), blocked (a human decides) or verifying with pending=true (call verification_status with wait=true).",
    },
    {
      ...completion,
      pr: z
        .number()
        .int()
        .positive()
        .optional()
        .describe(
          'The pull request number with this work, when there is one; PR and CI status are then tracked for it.',
        ),
    },
    (a, extra) => agent.reportCompletion(a, waitControl(extra, CHECKS_WAIT)),
  );

  tool(
    'verification_status',
    {
      human: 'none',
      title: 'Verification status',
      description:
        "A ticket's verification attempts, check results and verdicts (default: your current ticket). wait=true waits for running checks to finish, up to waitSeconds.",
      readOnly: true,
    },
    {
      trail,
      ticket: ticket.optional(),
      wait: z.boolean().optional(),
      waitSeconds: z.number().int().min(0).max(3600).optional(),
    },
    (a, extra) => agent.verificationStatus(a, waitControl(extra, CHECKS_WAIT)),
  );

  tool(
    'submit_review',
    {
      human: 'none',
      title: 'Submit a review',
      description:
        'Answer a review ticket (type review; default: the one you claimed) after reading the work it names. PASS finishes the reviewed ticket (or hands it to the human at checks+review+human), FAIL sends it back for rework with your findings, NEEDS_HUMAN asks the human. You cannot review a ticket you worked on.',
    },
    {
      trail,
      ticket: ticket.optional().describe('The review ticket.'),
      verdict: z.enum(['PASS', 'FAIL', 'NEEDS_HUMAN']),
      summary: text().min(1).describe('What you checked and what you found, in a few sentences.'),
      findings: z
        .array(
          z.object({
            path: z.string().optional(),
            line: z.number().int().positive().optional(),
            severity: z.enum(['info', 'warn', 'error']),
            text: text().min(1),
          }),
        )
        .max(50)
        .optional()
        .describe('Specific problems; with FAIL, what the author must fix.'),
      checklist: checklistAnswers,
    },
    (a) => agent.submitReview(a),
  );

  tool(
    'record_decision',
    {
      human: 'none',
      title: 'Record a decision',
      description:
        "Keep a DecisionRecord (question, answer, rationale, alternatives) and add it to the Logbook, without closing a ticket. The decision is recorded as yours; it is the human's only when questionId names the question they answered.",
      retired: ['decidedBy'],
    },
    {
      trail,
      ticket: ticket.optional(),
      question: text().min(1),
      answer: text().min(1),
      summary: z.string().optional(),
      rationale: text().optional(),
      alternatives: z.array(z.string()).optional(),
      questionId: z
        .string()
        .optional()
        .describe(
          "For a decision the human made: the ask_human question they answered in the Lookout or Slack (an answer given in an agent's chat is refused). The record keeps the question as asked and their answer word for word, yours as its reading; each answer backs one decision.",
        ),
      appendToTrail: z.boolean().optional(),
      category: riskCategory.optional(),
      paths: riskPaths.optional(),
      assumes: z.array(z.string()).optional().describe('Ids (S-<n>) of the trail assumptions this decision relies on.'),
    },
    (a) => agent.recordDecision(a),
  );
}
