import type { TrailAgent } from '../agent';
import { type DefineTool, ticket, trail } from '../toolKit';
import { proofReport } from '../trail/proof';

/** Verified by Teamtrail: the proof of a ticket's completion, read-only. */
export function registerProofTools(tool: DefineTool, agent: TrailAgent) {
  tool(
    'proof_report',
    {
      human: 'none',
      title: 'Proof report',
      description:
        "What Teamtrail recorded about a ticket's completion (default: your current ticket): the checks it ran, acceptance criteria verified or only claimed, the git range, the review and the decisions it relies on, as Markdown with a digest. Put `markdown` in your pull request description unchanged. Status is verified only when the latest attempt passed everything its verification level asks.",
      readOnly: true,
    },
    { trail, ticket: ticket.optional() },
    (a) => agent.with(proofReport, a),
  );
}
