import { readFileSync } from 'node:fs';
import path from 'node:path';
import { machineAccess } from '../machine/machineAccess';
import { OperationError } from '../planning/operations/operationError';
import { contentHash, trustKey, trustLedger, type TrustRecord } from '../trust/trustLedger';
import { parseVerificationConfig } from './config';
import { VERIFICATION_FILE, type ConfigRead } from './configFile';

/*
 * verification.json names the commands Teamtrail runs on the human's machine, and it is a file in the repo: an
 * agent can edit it, a teammate's push can bring it. So its commands run only while the file is exactly the one
 * the trail lead approved on this machine (trust/trustLedger.ts). While it differs (edited, new, or deleted),
 * no check runs and no completion that needs checks goes through: it waits, and the human is asked.
 */

/** `none`: no file and none approved, nothing to run. `first`: a file nobody approved here yet. */
export type ChecksState = 'approved' | 'none' | 'first' | 'changed' | 'removed';

export interface ChecksApproval {
  state: ChecksState;
  /** True for `first`, `changed` and `removed`: checks don't run until the trail lead approves. */
  waiting: boolean;
  /** The file as it is now; undefined when there is none. */
  text?: string;
  /** What approving now would approve: the file's hash, or `none` without a file. */
  hash: string;
  approved?: TrustRecord;
}

const NO_FILE = 'none';

function fileText(root: string): string | undefined {
  try {
    return readFileSync(path.join(root, VERIFICATION_FILE), 'utf8');
  } catch {
    return undefined;
  }
}

function stateOf(text: string | undefined, approved: TrustRecord | undefined): ChecksState {
  if (text === undefined) return !approved || approved.hash === NO_FILE ? 'none' : 'removed';
  if (!approved) return 'first';
  return approved.hash === contentHash(text) ? 'approved' : 'changed';
}

export function checksApproval(root: string): ChecksApproval {
  const text = fileText(root);
  const approved = trustLedger(root).get(trustKey.checks);
  const state = stateOf(text, approved);
  const hash = text === undefined ? NO_FILE : contentHash(text);
  return { state, waiting: state !== 'approved' && state !== 'none', text, hash, approved };
}

function parsed(root: string, text: string | undefined): ConfigRead {
  const file = path.join(root, VERIFICATION_FILE);
  if (!text) return { path: file, exists: false, errors: [] };
  return { path: file, exists: true, ...parseVerificationConfig(text), hash: contentHash(text) };
}

/**
 * The config Teamtrail acts on: the file when it is the approved one, else the last approved content, so an edit
 * can't drop a check, change a command or the default level of new trails before the human has seen it. A trail's or
 * ticket's own level lives in the tracker files and has its own approval (approvedLevel.ts). Read once, so what was
 * checked is what is used.
 */
export function trustedChecks(root: string): { config: ConfigRead; approval: ChecksApproval } {
  const approval = checksApproval(root);
  const text = approval.waiting ? approval.approved?.content : approval.text;
  return { config: parsed(root, text), approval };
}

const WHY: Record<ChecksState, string> = {
  approved: '',
  none: '',
  first: `${VERIFICATION_FILE} has check commands the trail lead has not approved on this machine yet`,
  changed: `${VERIFICATION_FILE} changed since the trail lead approved its check commands on this machine`,
  removed: `${VERIFICATION_FILE} was deleted since the trail lead approved its check commands on this machine`,
};

/** What a waiting completion tells the agent: plain, and clear that editing the file again won't help. */
export function checksWaitReason(a: ChecksApproval) {
  // a config folder this process can't use reads as "nothing approved": say what is really wrong
  const blocked = machineAccess();
  if (blocked) return `${blocked} This completion waits; your work is kept.`;
  return (
    `${WHY[a.state]}. No check runs until they approve it in the Lookout (Settings → Approvals), so this completion ` +
    'waits; your work is kept. Editing verification.json to get past a check does not work and is flagged to the human.'
  );
}

/** Thrown where checks would run without the trail lead's approval of the commands. */
export class ChecksNotApproved extends OperationError {}

/** The trail lead approved `text` (undefined: no file) as verification.json, on this machine. */
export function approveChecksHere(root: string, by: string, text: string | undefined): ChecksApproval {
  const record = { hash: text === undefined ? NO_FILE : contentHash(text), at: Date.now(), by, content: text ?? '' };
  trustLedger(root).set({ [trustKey.checks]: record });
  return checksApproval(root);
}
