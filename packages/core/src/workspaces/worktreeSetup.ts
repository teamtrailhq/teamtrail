import path from 'node:path';
import type { SetupOutcome } from '../model/setup';
import { hasSetup, runSetup } from '../setup/runSetup';
import { trustedChecks } from '../verification/checksApproval';
import { evidencePaths } from '../verification/evidenceStore';
import { preparedWorktree } from './trustedWorkspace';

/**
 * The approved setup steps, run in a ticket's worktree Teamtrail has just prepared: from the verification.json the
 * trail lead approved on this machine (never the file as an agent left it), only in the folder recorded as one
 * Teamtrail prepared, logs in the ticket's evidence (`setup/`). Undefined when no setup is approved.
 */
export async function worktreeSetup(o: {
  root: string;
  mapId: string;
  ticketId: string;
}): Promise<SetupOutcome | undefined> {
  const setup = trustedChecks(o.root).config.config?.setup;
  if (!hasSetup(setup)) return undefined;
  const dir = preparedWorktree(o.root, o.mapId, o.ticketId);
  if (!dir) return undefined;
  const rel = `${evidencePaths.ticket(o.mapId, o.ticketId)}/setup`;
  return runSetup({ worktree: dir, setup, logDir: path.join(o.root, rel), logRel: rel });
}
