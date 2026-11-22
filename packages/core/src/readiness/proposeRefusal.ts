import type { Ticket } from '../model/types';
import type { VerificationConfig } from '../model/verification';
import { approvedChecks } from './approvedChecks';

/**
 * Why an agent can't propose checks (`propose_checks`), or undefined when it can: only the agent working a trail's
 * setup ticket (model/setupTicket.ts), and only while no check is approved on this machine. Once checks are approved,
 * the trail lead sets them in the Lookout (Settings → Verification); a proposal never changes what is in force.
 */
export function proposeRefusal(o: {
  ticket: Pick<Ticket, 'key' | 'setup' | 'state' | 'assignee'>;
  agent: string;
  approved?: VerificationConfig;
}): string | undefined {
  const { ticket: t } = o;
  if (!t.setup) return `${t.key} isn't its trail's setup ticket: only the setup ticket of a new repo proposes checks`;
  if (t.state !== 'open') return `${t.key} is closed`;
  if (t.assignee !== o.agent) return `Claim ${t.key} first: its agent proposes the checks`;
  if (approvedChecks(o.approved).length)
    return 'Checks are already approved here: the trail lead changes them in the Lookout (Settings → Verification)';
  return undefined;
}
