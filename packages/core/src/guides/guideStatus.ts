import type { InstalledGuide, GuideDoc, GuideLockEntry } from '../model/guide';
import { checkSha, guideSha } from './guideHash';
import { lintGuide } from './guideLint';

export const LOCK_CHANGED =
  'guides.lock.json changed outside Teamtrail (by an agent, or pulled with git); waiting for your approval';

/** Its lock entry came with the repo: a clone, a teammate's install, a repo that moved, or an approval from an earlier version. */
export const NOT_APPROVED_HERE =
  'approved elsewhere, not on this machine yet; approvals are kept per machine, outside the repo, and a repo that moved is asked again';

/** Proposed checks of `guide` the lock has no approval for at their current argv. */
export const pendingChecks = (guide: GuideDoc, lock?: GuideLockEntry) =>
  Object.entries(guide.proposedChecks)
    .filter(([name, spec]) => lock?.approvedChecks[name] !== checkSha(spec))
    .map(([name]) => name);

/**
 * One guide file checked against the lock: invalid when it fails the lint or its id doesn't match the file name,
 * unapproved without a lock entry, tampered when it no longer matches the approved hash, else active.
 * Built-in guides ship with Teamtrail and need no lock entry.
 */
export function guideStatus(file: {
  id: string;
  origin: 'builtin' | 'local';
  text: string;
  lock?: GuideLockEntry;
  overridesBuiltin?: boolean;
  /** Its guides.lock.json entry differs from what the trail lead approved here; `lock` is then the approved one. */
  lockChanged?: boolean;
}): InstalledGuide {
  const lint = lintGuide(file.text);
  const sha256 = guideSha(file.text);
  const base = {
    id: file.id,
    origin: file.origin,
    sha256,
    ...(lint.guide ? { guide: lint.guide } : {}),
    ...(file.lock ? { lock: file.lock } : {}),
    findings: lint.findings,
    pendingChecks: lint.guide && file.origin === 'local' ? pendingChecks(lint.guide, file.lock) : [],
    overridesBuiltin: !!file.overridesBuiltin,
  };
  const firstError = lint.findings.find((f) => f.level === 'error');
  if (firstError) return { ...base, status: 'invalid', reason: `line ${firstError.line}: ${firstError.message}` };
  if (lint.guide?.id !== file.id)
    return {
      ...base,
      status: 'invalid',
      reason: `its id "${lint.guide?.id}" doesn't match the file name ${file.id}.md`,
    };
  if (file.origin === 'builtin') return { ...base, status: 'active' };
  if (file.lockChanged && !file.lock) return { ...base, status: 'unapproved', reason: NOT_APPROVED_HERE };
  if (file.lockChanged) return { ...base, status: 'tampered', reason: LOCK_CHANGED };
  if (!file.lock) return { ...base, status: 'unapproved', reason: 'not approved by the trail lead yet' };
  if (file.lock.sha256 !== sha256)
    return { ...base, status: 'tampered', reason: `changed since version ${file.lock.version} was approved` };
  return { ...base, status: 'active' };
}

/** A pinned guide whose file is gone: still tampered, so its approved required checks keep applying. */
export const missingGuide = (id: string, lock: GuideLockEntry): InstalledGuide => ({
  id,
  origin: 'local',
  status: 'tampered',
  reason: `the file is missing (version ${lock.version} was approved)`,
  lock,
  findings: [],
  pendingChecks: [],
  overridesBuiltin: false,
});
