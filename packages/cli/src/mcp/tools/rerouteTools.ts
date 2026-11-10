import { DESTINATION_REASONS, type DestinationReason } from '@teamtrail/core';
import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { type DefineTool, trail, ticket, ticketType, waitControl } from '../toolKit';
import { challengeAssumptionOp, listAssumptions } from '../trail/assumptions';
import { proposeRerouteOp, rerouteStatus } from '../trail/reroutes';

const ref = z.string().min(1);
const text = z.string().min(1);

/** One typed change to the map. Tickets by key (#12) or id; tickets this proposal adds by their `ref`. */
const change = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('add_ticket'),
    ref: ref.describe('Local name other changes can use, e.g. "batch-fallback".'),
    title: text,
    type: ticketType,
    body: z.string().optional(),
    hitl: z.boolean().optional(),
    blockedBy: z.array(ref).optional(),
  }),
  z.object({ op: z.literal('cancel_ticket'), ticket: ref, reason: text }),
  z.object({
    op: z.literal('edit_ticket'),
    ticket: ref,
    title: z.string().optional().describe('The new title.'),
    body: z.string().optional().describe('The new description; it replaces the old one.'),
  }),
  z.object({
    op: z.literal('rewire'),
    ticket: ref,
    addBlockedBy: z.array(ref).optional().describe('Tickets it must now wait for.'),
    removeBlockedBy: z.array(ref).optional().describe('Current blockers it no longer waits for.'),
  }),
  z.object({ op: z.literal('supersede_decision'), decision: ref.describe('D-<n>'), answer: text, rationale: text }),
  z.object({ op: z.literal('update_destination'), text }),
  z.object({ op: z.literal('add_unspecified'), text }),
  z.object({ op: z.literal('add_out_of_scope'), text }),
  z.object({ op: z.literal('reopen'), ticket: ref, reason: text }),
]);

/** Adaptive trails: assumptions, challenges and reroute proposals the human approves. */
export function registerRerouteTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'list_assumptions',
    {
      human: 'none',
      title: 'List assumptions',
      description:
        "The trail's assumptions (S-<n>), their status (holding, challenged, invalidated, confirmed), and the tickets and decisions that depend on each.",
      readOnly: true,
    },
    { trail },
    (a) => agent.with(listAssumptions, a),
  );

  tool(
    'challenge_assumption',
    {
      human: 'none',
      title: 'Challenge an assumption',
      description:
        'You found evidence that an assumption does not hold. Marks it challenged and returns what depends on it. Then propose_reroute; do not silently work around it.',
    },
    {
      trail,
      assumption: ref.describe('S-<n>'),
      evidence: text.describe('What you found: paths, output, docs. Never a guess.'),
      ticket: ticket.optional().describe('Where the finding came up; default your current ticket.'),
    },
    (a) => agent.with(challengeAssumptionOp, a),
  );

  tool(
    'propose_reroute',
    {
      human: 'none',
      title: 'Propose a reroute',
      description:
        'Propose typed changes to the map for the human to approve. Nothing changes until they do; the tickets it cancels, edits or rewires are frozen meanwhile. kind "challenge-destination" says the destination itself is wrong (the work exists already, it targets the wrong problem, or it should be rescoped) and needs an update_destination change. A newer proposal of yours replaces your pending one.',
    },
    {
      trail,
      kind: z.enum(['reroute', 'challenge-destination']).optional().describe('Default reroute.'),
      destinationReason: z
        .enum(DESTINATION_REASONS as [DestinationReason, ...DestinationReason[]])
        .optional()
        .describe('challenge-destination only.'),
      reason: text.describe('Why the plan should change, in a few lines.'),
      evidence: text.describe('What you found, with paths or output.'),
      invalidates: z.array(ref).optional().describe('Assumptions (S-<n>) the evidence shows are wrong.'),
      changes: z.array(change).min(1),
    },
    (a) => agent.with(proposeRerouteOp, a),
  );

  tool(
    'reroute_status',
    {
      human: 'none',
      title: 'Reroute status',
      description:
        "A proposal's decision: pending, approved (applied), rejected (with the human's note) or superseded. Default: your latest proposal on the trail. wait: true blocks until the human decides.",
      readOnly: true,
    },
    {
      trail,
      id: z.string().optional().describe('R-<n>; default your latest.'),
      wait: z.boolean().optional(),
      waitSeconds: z
        .number()
        .int()
        .min(0)
        .max(3600)
        .optional()
        .describe('With wait: how long (default 600; 50 for Codex).'),
    },
    (a, extra) =>
      agent.with(
        (ctx, input: typeof a) =>
          rerouteStatus(
            ctx,
            input,
            agent.defaultWaitSeconds(),
            waitControl(extra, 'Waiting for the human to decide the reroute'),
          ),
        a,
      ),
  );
}
