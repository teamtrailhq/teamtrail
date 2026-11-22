import type { GitEvidence } from '../model/evidence';
import type { Ticket } from '../model/types';
import { latestBaseline } from './baseline';

/**
 * Whether a completion's checks are the ones its own setup ticket proposed (model/setupTicket.ts): a new repo's setup
 * ticket, claimed while no checks were approved here, now run with approved ones. Its config change and what its
 * checks run are then new, not weakened, and the trail lead approved them before they ran.
 */
export function setupProposal(o: {
  root: string;
  mapId: string;
  ticket: Pick<Ticket, 'id' | 'setup'>;
  configHash?: string;
}) {
  if (!o.ticket.setup || !o.configHash) return false;
  return !latestBaseline(o.root, o.mapId, o.ticket.id)?.configHash;
}

/** A runner's evidence marked as a setup ticket's own proposal, with the info flag the reviewer reads. */
export function markedSetup(git: GitEvidence): GitEvidence {
  const flag = {
    kind: 'setup' as const,
    level: 'info' as const,
    message: 'the setup ticket proposed these checks; the trail lead approved them before they ran',
  };
  return { ...git, setup: true, flags: [...git.flags, flag] };
}
