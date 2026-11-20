import { lstatSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { journalFile } from '../history/journalFile';
import { TRUST_JOURNAL } from '../model/lifecycle';
import { OperationError } from '../planning/operations/operationError';
import { approveChecksHere, checksApproval } from './checksApproval';
import { parseVerificationConfig } from './config';
import { VERIFICATION_FILE } from './configFile';

/** The text's setup steps as JSON, without the `shown` ones (steps the person is approving in this very step). */
function setupOf(text: string | undefined, shown: string[] = []) {
  const setup = (text ? parseVerificationConfig(text).config?.setup : undefined) ?? {};
  return JSON.stringify(Object.fromEntries(Object.entries(setup).filter(([name]) => !shown.includes(name))));
}

/**
 * Setup steps the text would approve that the trail lead hasn't approved here. Only Repo readiness adds setup steps
 * from the Lookout, each shown before it's added (`shown`): any other step in the file they never approved (an
 * agent's, a teammate's) would ride along unseen, so it is approved in Settings → Approvals, where it is shown, first.
 */
function unseenSetup(root: string, text: string, shown: string[] = []) {
  const approved = checksApproval(root).approved?.content || undefined;
  if (setupOf(text, shown) === setupOf(approved)) return undefined;
  return `${VERIFICATION_FILE} has setup steps you haven't approved yet: approve them in Settings → Approvals first`;
}

/**
 * Writes verification.json as the trail lead set it in the Lookout and approves it on this machine in the same step,
 * journaled under `_trust`: refused when the text wouldn't parse, and never through a symbolic link (written to a
 * temp file and renamed), nor with setup steps nobody approved here but the `shownSetup` ones the person was shown. The caller has already checked the `base` the
 * person saw.
 */
export function writeApprovedConfig(o: {
  root: string;
  text: string;
  by: string;
  subject: string;
  shownSetup?: string[];
}) {
  const { errors } = parseVerificationConfig(o.text);
  if (errors.length) throw new OperationError(`${VERIFICATION_FILE} would be invalid: ${errors.join('; ')}`);
  const unseen = unseenSetup(o.root, o.text, o.shownSetup);
  if (unseen) throw new OperationError(unseen);
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
