import type { Ticket } from '../model/types';
import type { ChecksApproval } from '../verification/checksApproval';
import type { LevelInfo } from '../verification/policy';

/**
 * Why a setup ticket's completion (model/setupTicket.ts) can't go through yet, or undefined when it can: it proposes
 * the checks the trail is verified with, so with none at all nothing would check it. Checks it proposed and the trail
 * lead hasn't approved yet are not a refusal: that completion waits for the approval like any other. `suggested` is
 * what reading the repo now suggests, as command lines.
 */
export function setupCompletionRefusal(o: {
  t: Pick<Ticket, 'key' | 'setup'>;
  info: Pick<LevelInfo, 'level' | 'checks'>;
  approval: Pick<ChecksApproval, 'waiting'>;
  suggested: string[];
}): string | undefined {
  if (!o.t.setup || o.info.level === 'off' || o.approval.waiting || o.info.checks.length) return undefined;
  const hint = o.suggested.length ? ` Reading the repo now suggests: ${o.suggested.join('; ')}.` : '';
  return (
    `${o.t.key} sets the project up, so it proposes the checks the rest of the trail is verified with, and nothing ` +
    'would check it without them. Propose them with propose_checks (each check a name and its argv), then call ' +
    `close_ticket again: it waits for the trail lead's approval, then runs them on this work.${hint}`
  );
}
