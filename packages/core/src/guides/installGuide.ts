import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { GuideDoc, GuideLockEntry, GuideLockReview, GuideLockSource } from '../model/guide';
import { OperationError } from '../planning/operations/operationError';
import { readApprovedLock } from './approvedLock';
import { guideSha } from './guideHash';
import { lintGuide } from './guideLint';
import { readGuideLock, writeGuideLock } from './guideLock';
import { readGuidesConfig } from './guidesConfig';
import { pendingChecks } from './guideStatus';
import { guideFilePath, guidesDir } from './guideStore';

export interface Installed {
  guide: GuideDoc;
  entry: GuideLockEntry;
  /** Proposed checks still waiting for the trail lead. */
  pendingChecks: string[];
  /** It replaced an installed version. */
  updated: boolean;
}

/** Why a guide can't be installed: its lint errors, one per line. */
export function lintRefusal(text: string): string | undefined {
  const lint = lintGuide(text);
  if (lint.ok) return undefined;
  const errors = lint.findings.filter((f) => f.level === 'error').map((f) => `line ${f.line}: ${f.message}`);
  return `This guide can't be used:\n${errors.join('\n')}`;
}

/**
 * Writes a guide file into `guides/` and pins it in `guides.lock.json`: its version, sha256, source and who added it.
 * Earlier check approvals stay on record, but a check whose argv changed needs approval again. Refuses a file that
 * fails the lint. `expectId` guards against a catalog entry that names a different guide. `review` is what the catalog
 * says about it, recorded for display only.
 */
export function installGuide(input: {
  root: string;
  text: string;
  source: GuideLockSource;
  by: string;
  expectId?: string;
  review?: GuideLockReview;
  now?: number;
}): Installed {
  const refusal = lintRefusal(input.text);
  if (refusal) throw new OperationError(refusal);
  const guide = lintGuide(input.text).guide!;
  if (input.expectId && guide.id !== input.expectId)
    throw new OperationError(`the file is guide "${guide.id}", not "${input.expectId}"`);
  mkdirSync(guidesDir(input.root), { recursive: true });
  writeFileSync(guideFilePath(input.root, guide.id), input.text);
  const lock = readGuideLock(input.root);
  const prev = lock.guides[guide.id];
  // what the trail lead approved before stays on record when this machine's approval and the lock agree on it; a
  // check whose argv changed is pending again. A pushed lock alone never counts: it could pre-fill any check's hash.
  const approvedHere = readApprovedLock(input.root).guides[guide.id]?.approvedChecks ?? {};
  const kept = Object.entries(prev?.approvedChecks ?? {}).filter(
    ([n, sha]) => n in guide.proposedChecks && approvedHere[n] === sha,
  );
  const entry: GuideLockEntry = {
    version: guide.version,
    sha256: guideSha(input.text),
    source: input.source,
    addedAt: new Date(input.now ?? Date.now()).toISOString(),
    addedBy: input.by,
    approvedChecks: Object.fromEntries(kept),
    requiresChecks: guide.requiresChecks,
    ...(input.review ? { review: input.review } : {}),
  };
  lock.guides[guide.id] = entry;
  writeGuideLock(input.root, lock, guide.id);
  return { guide, entry, pendingChecks: pendingChecks(guide, entry), updated: !!prev };
}

/**
 * Where an approved guide came from: as approved on this machine, else the committed lock's catalog when it is one
 * of the catalogs approved here, else a local file. An address only the committed lock names is never fetched.
 */
function sourceFor(root: string, id: string): GuideLockSource {
  const approved = readApprovedLock(root).guides[id]?.source;
  if (approved) return approved;
  const committed = readGuideLock(root).guides[id]?.source;
  if (!committed || committed === 'local') return 'local';
  const known = readGuidesConfig(root).config.registries.some((r) => r.url === committed.registry);
  return known ? committed : 'local';
}

/**
 * The trail lead approves the guide file as it is now (a hand-written guide, one edited after approval, or one that
 * came with the repo). `sha256` is the hash of the text they were shown: a file that changed since is refused.
 * Its checks keep only the approvals made on this machine; each other one waits for its own.
 */
export function approveGuide(input: {
  root: string;
  id: string;
  by: string;
  sha256?: string;
  now?: number;
}): Installed {
  let text: string;
  try {
    text = readFileSync(guideFilePath(input.root, input.id), 'utf8');
  } catch {
    throw new OperationError(`no guide file ${input.id}.md to approve`);
  }
  if (input.sha256 && guideSha(text) !== input.sha256)
    throw new OperationError(`${input.id}.md changed since it was shown to you; look at it again before approving`);
  // the catalog's review stays only for the exact file Teamtrail recorded it for, never for an edited or re-pinned one
  const approved = readApprovedLock(input.root).guides[input.id];
  const review = approved?.sha256 === guideSha(text) ? approved.review : undefined;
  const source = sourceFor(input.root, input.id);
  return installGuide({ ...input, text, source, expectId: input.id, review });
}
