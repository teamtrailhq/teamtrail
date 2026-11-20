import path from 'node:path';
import type { RepoFiles } from '../model/checkScreening';
import type { ReadinessFix, RepoReadiness } from '../model/readiness';
import { OperationError } from '../planning/operations/operationError';
import { checkFolderProblem } from '../verification/checkFolder';
import { checksApproval } from '../verification/checksApproval';
import { VERIFICATION_FILE } from '../verification/configFile';
import { readRawConfig } from '../verification/rawConfig';
import { StaleChecks } from '../verification/setChecks';
import { writeApprovedConfig } from '../verification/writeApprovedConfig';
import { applyFix, type FixedConfig } from './fixedConfig';

type Obj = Record<string, Record<string, unknown>>;

/** The fixes asked for, each exactly as it was shown (its hash), or refused as changed since. */
function shownFixes(readiness: RepoReadiness, asked: { id: string; hash: string }[]): ReadinessFix[] {
  if (!asked.length) throw new OperationError('no fix named');
  return asked.map((a) => {
    const f = readiness.findings.find((x) => x.id === a.id);
    if (!f?.fix || f.fixHash !== a.hash) throw new StaleChecks('This changed since you looked; check again');
    return f.fix;
  });
}

/** The folders the fixes name, each a real folder in the repo (no symbolic link on the way). */
async function foldersProblem(fixes: ReadinessFix[], files?: RepoFiles) {
  const cwds = fixes.flatMap((f) => (f.kind === 'add-checks' ? f.checks.map((c) => c.cwd) : [f.cwd]));
  for (const cwd of [...new Set(cwds)]) {
    const problem = await checkFolderProblem({ cwd, files });
    if (problem) return problem;
  }
  return undefined;
}

/**
 * Applies Repo readiness fixes the trail lead clicked: add suggested checks (with their folders), set a check's
 * folder, add a frozen install as a setup step. Each is named by its finding and the hash of the fix as shown, and
 * verification.json is written with exactly those changes and approved on this machine in the same step
 * (writeApprovedConfig.ts, journaled): only over `base`, the checks approval as the page loaded it, and never while
 * the file waits for an approval (that is settled in Settings → Approvals first). A check that isn't a known shape
 * needs `acknowledged`.
 */
export async function applyReadinessFixes(o: {
  root: string;
  readiness: RepoReadiness;
  fixes: { id: string; hash: string }[];
  base: string;
  acknowledged?: boolean;
  files?: RepoFiles;
  by: string;
}) {
  const now = checksApproval(o.root);
  if (now.waiting)
    throw new OperationError(
      `${VERIFICATION_FILE} has changes waiting for your approval: settle them in Approvals first`,
    );
  if (o.base !== now.hash) throw new StaleChecks(`${VERIFICATION_FILE} changed since you opened it; look again`);
  const fixes = shownFixes(o.readiness, o.fixes);
  const badFolder = await foldersProblem(fixes, o.files);
  if (badFolder) throw new OperationError(badFolder);
  const raw = readRawConfig(path.join(o.root, VERIFICATION_FILE), { v: 1, default: 'checks' });
  const run = Array.isArray(raw.run) ? raw.run.filter((n): n is string => typeof n === 'string') : [];
  const c: FixedConfig = {
    raw,
    checks: { ...((raw.checks ?? {}) as Obj) },
    run,
    setup: { ...((raw.setup ?? {}) as Obj) },
    addedSetup: [],
    done: [],
    unknown: [],
  };
  for (const fix of fixes) applyFix(c, fix);
  if (c.unknown.length && !o.acknowledged)
    throw new OperationError(
      `${c.unknown.join(', ')}: Teamtrail doesn't know this program; confirm you know what it runs`,
    );
  const setup = Object.keys(c.setup).length ? { setup: c.setup } : {};
  const text = `${JSON.stringify({ ...raw, v: 1, checks: c.checks, run: c.run, ...setup }, null, 2)}\n`;
  const subject = `repo readiness, in the Lookout: ${c.done.join('; ')}`;
  return writeApprovedConfig({ root: o.root, text, by: o.by, subject, shownSetup: c.addedSetup });
}
