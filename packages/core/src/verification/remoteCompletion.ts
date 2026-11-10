import type { CriteriaResult, CriterionEvidence } from '../criteria/criteria';
import { gradeCriteria } from './gradeCriteria';
import type { ChecksOutcome } from './runChecks';

/**
 * A completion from an agent connected over HTTP from another machine. Its changes aren't in this checkout, so
 * running the checks or reading git here would be evidence about someone else's code. Nothing runs: the attempt
 * says so and the ticket goes to the human, who reviews the branch or pull request and approves, or pulls the
 * work and re-runs the checks here.
 */
export const REMOTE_COMPLETION_NOTE =
  "Completed by a remote agent: its changes aren't in this checkout, so no check ran and no git evidence was read. Review its branch or pull request and approve, or pull the work here and re-run the checks.";

const MAX_LISTED = 20;

/** The files a remote agent says it changed, as the human reads them: its word, since no git was read here. */
function declaredLine(paths: string[] | undefined) {
  if (!paths?.length) return 'It named no changed files.';
  const more = paths.length - MAX_LISTED;
  const shown = paths.slice(0, MAX_LISTED).join(', ');
  return `Files it says it changed (not verified): ${shown}${more > 0 ? ` and ${more} more` : ''}.`;
}

/**
 * What a remote completion comes to: nothing ran, so it is an error for the human, with the files the agent named
 * and its criteria evidence, every piece of it the agent's word.
 */
export function remoteGraded(
  env: { root: string },
  job: { mapId: string; ticket: { id: string }; sub: { criteria?: CriterionEvidence[]; declaredPaths?: string[] } },
): ChecksOutcome & { criteria?: CriteriaResult } {
  const criteria = gradeCriteria(
    { root: env.root, mapId: job.mapId, ticketId: job.ticket.id, evidence: job.sub.criteria },
    [],
  );
  const note = `${REMOTE_COMPLETION_NOTE} ${declaredLine(job.sub.declaredPaths)}`;
  return { checks: [], result: 'error', note, ...(criteria ? { criteria } : {}) };
}
