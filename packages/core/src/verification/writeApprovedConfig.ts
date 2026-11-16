import { lstatSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import { OperationError } from '../planning/operations/operationError';
import { approveChecksHere } from './checksApproval';
import { parseVerificationConfig } from './config';
import { VERIFICATION_FILE } from './configFile';

/**
 * Writes verification.json as the trail lead set it in the Lookout and approves it on this machine in the same step,
 * journaled under `_trust`: refused when the text wouldn't parse, and never through a symbolic link (written to a
 * temp file and renamed). The caller has already checked the `base` the person saw.
 */
export function writeApprovedConfig(o: { root: string; text: string; by: string; subject: string }) {
  const { errors } = parseVerificationConfig(o.text);
  if (errors.length) throw new OperationError(`${VERIFICATION_FILE} would be invalid: ${errors.join('; ')}`);
  const file = path.join(o.root, VERIFICATION_FILE);
  if (lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink())
    throw new OperationError(`${VERIFICATION_FILE} is a link; replace it by hand`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, o.text, { flag: 'wx' });
  renameSync(tmp, file);
  const approval = approveChecksHere(o.root, o.by, o.text);
  journalFile(o.root).append({
    v: 1,
    kind: 'trust',
    at: Date.now(),
    mapId: TRUST_JOURNAL,
    action: 'approved',
    subject: o.subject,
    detail: approval.hash,
    actor: o.by,
    actorKind: 'trail lead',
  });
  return approval;
}
