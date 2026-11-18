import { z } from 'zod';
import type { TrailAgent } from '../agent';
import { type DefineTool, ticket, trail } from '../toolKit';
import { proofReport } from '../trail/proof';
import { trailProofReport } from '../trail/trailProof';

/** Verified by Teamtrail: the proof of a ticket's completion, read-only. */
export function registerProofTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'proof_report',
    {
      human: 'none',
      title: 'Proof report',
      description:
        "What Teamtrail recorded about a ticket's completion (default: your current ticket): the checks it ran, acceptance criteria verified or only claimed, the git range, the review and the decisions it relies on, as Markdown with a digest. Put `markdown` in your pull request description unchanged. Status is verified only when the latest attempt passed everything its verification level asks. With `wholeTrail: true`, the trail's proof instead: each done ticket's proof and the approved checks Teamtrail ran on the default branch with all of their merges together; the trail is verified only when every ticket is and that run passed.",
      readOnly: true,
    },
    {
      trail,
      ticket: ticket.optional(),
      wholeTrail: z.boolean().optional().describe("true: the whole trail's proof, not a ticket's."),
    },
    (a) => (a.wholeTrail ? agent.with(trailProofReport, a) : agent.with(proofReport, a)),
  );
}
