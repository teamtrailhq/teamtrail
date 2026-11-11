import { CRITERION_KINDS, type CriterionKind } from '@teamtrail/core';
import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { text } from '../lineSafety';
import { type DefineTool, guideId, trail, ticketType } from '../toolKit';

/** Trail tools: status, start, resume and edit a trail. */
export function registerTrailTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'status',
    {
      human: 'none',
      title: 'Trail status',
      description:
        'Progress, ready/claimed/blocked tickets, running sessions, questions waiting on the human, recent decisions and spend. Also lists every trail.',
      readOnly: true,
    },
    { trail },
    (a) => agent.status(a.trail),
  );

  tool(
    'start_trail',
    {
      human: {
        kind: 'inputs',
        inputs: {
          discovery: {
            why: "Skipping discovery is the human's call, and they are not at your terminal. The trail starts with discovery; they accept the brief in the Lookout.",
            unless: (v) => v !== false,
          },
        },
      },
      title: 'Start a trail',
      description:
        'Create a trail from a framed idea: destination (what done looks like), notes, decisions already made, open questions (not yet specified), out of scope, and the first tickets with blocking edges (by ref). Frame it first: ask the framing questions with ask_human (framing: true).',
    },
    {
      title: z.string().min(1).describe('Short trail title.'),
      destination: text().min(1).describe('What "done" looks like.'),
      notes: text().optional(),
      mode: z.enum(['plan+execute', 'plan-only']).optional().describe('plan-only disables execute tickets.'),
      decided: z.array(z.string()).optional().describe('Decisions already made, one line each.'),
      unspecified: z.array(z.string()).optional().describe('Known unknowns, kept under Not yet specified.'),
      outOfScope: z.array(z.string()).optional(),
      tickets: z
        .array(
          z.object({
            ref: z.string().describe('Local ref used by blockedBy, e.g. "auth".'),
            title: z.string(),
            type: ticketType,
            body: text().optional(),
            hitl: z.boolean().optional().describe('task/execute only: needs the human.'),
            blockedBy: z.array(z.string()).optional().describe('Refs of tickets that must close first.'),
            guide: guideId.optional(),
            criteria: z
              .array(
                z.object({
                  text: z.string().min(1),
                  kind: z.enum(CRITERION_KINDS as [CriterionKind, ...CriterionKind[]]),
                  source: z.string().optional(),
                }),
              )
              .optional()
              .describe('Acceptance criteria for implementation tickets: what must be true for it to be done.'),
          }),
        )
        .optional(),
      assumptions: z
        .array(
          z.object({
            text: z.string().min(1),
            tickets: z.array(z.string()).optional().describe('Refs of tickets that depend on it.'),
          }),
        )
        .optional()
        .describe('What the plan relies on and could turn out wrong, e.g. "the v2 API supports batch writes".'),
      team: z
        .array(z.string())
        .max(20)
        .optional()
        .describe(
          "The trail's team: the installed guides (list_guides) its tickets use. With reviewer, review tickets get the reviewer guide.",
        ),
      discovery: z
        .boolean()
        .optional()
        .describe(
          'Default true: the trail starts with a discovery ticket, and implementation tickets wait until the human accepts your discovery brief. false asks the human to skip it: the trail still starts with discovery, and a request waits for them to approve or decline in the Lookout or Slack (reroute_status tells you).',
        ),
      skipReason: text()
        .optional()
        .describe('With discovery=false: why discovery can be skipped, for the human who decides.'),
    },
    (a) => agent.startTrail(a),
  );

  tool(
    'resume_trail',
    {
      human: 'none',
      title: 'Resume a trail',
      description:
        'Pick up a trail: opens a session, returns status, any ticket you still hold and the next ready ticket.',
    },
    { trail },
    (a) => agent.resumeTrail(a.trail),
  );

  tool(
    'update_trail',
    {
      human: {
        kind: 'inputs',
        inputs: {
          mode: { why: "The trail's mode is the trail lead's setting: they switch it in the Lookout." },
          destination: {
            why: "The destination is the human's. Propose a new one with propose_reroute (kind challenge-destination); they approve it in the Lookout.",
          },
        },
      },
      title: 'Update trail',
      description:
        "Edit the notes, add Not yet specified, Out of scope or Assumptions lines. A new destination or mode is the human's: it becomes a request (returned in requests) they approve or decline in the Lookout or Slack, and nothing changes until they approve. To change the plan itself (cancel, rewire), use propose_reroute.",
    },
    {
      trail,
      destination: text()
        .optional()
        .describe(
          "The human's: a new destination is a request they approve or decline in the Lookout or Slack (or propose_reroute with kind challenge-destination, with evidence).",
        ),
      notes: text().optional(),
      addUnspecified: z.array(z.string()).optional(),
      addOutOfScope: z.array(z.string()).optional(),
      addAssumptions: z
        .array(z.object({ text: z.string().min(1), tickets: z.array(z.string()).optional().describe('Ticket keys.') }))
        .optional(),
      mode: z
        .enum(['plan+execute', 'plan-only'])
        .optional()
        .describe(
          "The human's setting: a new mode is a request they approve or decline in the Lookout or Slack; nothing changes until they approve.",
        ),
      reason: text().optional().describe('Why you ask for a new mode or destination, for the human who decides.'),
    },
    (a) => agent.updateTrail(a),
  );

  tool(
    'submit_brief',
    {
      human: 'none',
      title: 'Submit the discovery brief',
      description:
        'Before implementation: what you found about the existing system, for the human to review. Cite real paths; never guess. Implementation tickets (task, execute, prototype) can be claimed once the human accepts it.',
    },
    {
      trail,
      summary: text().min(1).describe('What this trail changes, in a few lines.'),
      productContext: text()
        .optional()
        .describe('Who it affects, business rules and UX principles that apply, plan or pricing constraints.'),
      existing: text().min(1).describe('Files, services and modules involved, each with its path and one line.'),
      conventions: text().optional().describe('Conventions and abstractions to follow.'),
      dataModel: text().optional().describe('Data model impact.'),
      api: text().optional().describe('API impact.'),
      risks: text().optional().describe('Risks and possible regressions.'),
      assumptions: z.array(z.string()).optional().describe('Assumptions you rely on, one each.'),
      openQuestions: z.array(z.string()).optional(),
    },
    (a) => agent.submitBrief(a),
  );

  tool(
    'get_brief',
    {
      human: 'none',
      title: 'Read the discovery brief',
      description: "The trail's discovery brief, its status and any change request.",
      readOnly: true,
    },
    { trail },
    (a) => agent.getBrief(a),
  );
}
