import { randomBytes } from 'node:crypto';
import { lstatSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { journalFile } from '../../history/journalFile';
import type { ChecksProposedEntry } from '../../model/setupTicket';
import { parseVerificationConfig } from '../../verification/config';
import { VERIFICATION_FILE } from '../../verification/configFile';
import { OperationError } from '../operations/operationError';

/**
 * Writes a setup ticket's proposed checks (verification/proposedChecksText.ts) to the tracker folder's
 * verification.json, after `proposeRefusal` said its agent may, and journals the proposal. It approves nothing: the
 * file now differs from what this machine approved, so no check runs until the trail lead approves it (Settings →
 * Approvals), hash-bound to what they were shown. For an agent whose files aren't on this machine (a remote agent),
 * this is how its proposal reaches the file.
 */
export function proposeSetupChecks(o: {
  root: string;
  mapId: string;
  ticketId: string;
  by: string;
  text: string;
  names: string[];
}): void {
  const { errors } = parseVerificationConfig(o.text);
  if (errors.length) throw new OperationError(`${VERIFICATION_FILE} would be invalid: ${errors.join('; ')}`);
  const file = path.join(o.root, VERIFICATION_FILE);
  if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new OperationError(`${VERIFICATION_FILE} is a link: Teamtrail won't write through it`);
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, o.text, { flag: 'wx' });
  renameSync(tmp, file);
  const entry: ChecksProposedEntry = {
    v: 1,
    kind: 'checks-proposed',
    at: Date.now(),
    mapId: o.mapId,
    ticketId: o.ticketId,
    actor: o.by,
    actorKind: 'agent',
    checks: o.names,
  };
  journalFile(o.root).append(entry);
}
