import path from 'node:path';
import { checkArgv, checkNotice } from '../guides/checkArgv';
import { OperationError } from '../planning/operations/operationError';
import { checkFolder } from './checkFolder';
import { checkGlobs, MAX_CHECK_GLOBS } from './checkGlobs';
import { checksApproval } from './checksApproval';
import { VERIFICATION_FILE } from './configFile';
import { readRawConfig } from './rawConfig';
import { writeApprovedConfig } from './writeApprovedConfig';

/**
 * One check as the person set it: a name, its argv (never a shell line), the folder it runs in, repo-relative
 * ('' for the top), and the files it is about (`paths`, globs; [] for every change). Without `cwd` or `paths` a
 * check that keeps its name keeps its own.
 */
export interface CheckInput {
  name: string;
  run: string[];
  cwd?: string;
  paths?: string[];
}

/** The file changed since the person loaded it: they'd overwrite what they never saw. */
export class StaleChecks extends OperationError {}

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_CHECKS = 10;
const ARG_OK = (a: unknown): a is string =>
  typeof a === 'string' && a.length > 0 && a.length <= 300 && !/[\0\r\n]/.test(a);

type Kept = Record<string, Record<string, unknown>>;

/** The folder a check will run in: the one given, else the one it had under its name. */
function folderOf(c: CheckInput, kept: Kept): string | undefined {
  if (c.cwd !== undefined) return checkFolder(c.cwd);
  const had = kept[c.name]?.cwd;
  return typeof had === 'string' ? checkFolder(had) : undefined;
}

/**
 * Why a list of checks can't be set, or undefined: names, sizes, and argv that carries or downloads code. Whether a
 * program is known is judged in the folder the check will run in (`../node_modules/.bin/jest` from `apps/web`).
 */
function problemOf(checks: CheckInput[], o: { acknowledged: boolean; kept: Kept }): string | undefined {
  if (checks.length > MAX_CHECKS) return `at most ${MAX_CHECKS} checks`;
  const names = new Set<string>();
  for (const c of checks) {
    if (!NAME.test(c.name)) return `"${c.name}": a name of lowercase letters, digits and dashes`;
    if (names.has(c.name)) return `"${c.name}" twice`;
    names.add(c.name);
    if (!Array.isArray(c.run) || !c.run.length || c.run.length > 30 || !c.run.every(ARG_OK))
      return `${c.name}: a command of 1–30 words`;
    if (c.cwd !== undefined && (typeof c.cwd !== 'string' || checkFolder(c.cwd) === undefined))
      return `${c.name}: a folder inside the repository`;
    if (c.paths !== undefined && !checkGlobs(c.paths))
      return `${c.name}: up to ${MAX_CHECK_GLOBS} paths inside the repository`;
    const spec = { run: c.run, cwd: folderOf(c, o.kept) };
    const unsafe = checkArgv(spec);
    if (unsafe.length) return `${c.name} ${unsafe.join('; ')}`;
    const notice = checkNotice(spec);
    if (notice && !o.acknowledged) return `${c.name}: ${notice}; confirm you know what it runs`;
  }
  return undefined;
}

/** The check as it's written: what the file had under its name, the new argv, the folder and paths when given. */
function specOf(c: CheckInput, kept: Record<string, unknown> = {}): Record<string, unknown> {
  const { cwd: keptCwd, paths: keptPaths, ...rest } = kept;
  const folder = c.cwd === undefined ? keptCwd : checkFolder(c.cwd);
  const paths = c.paths === undefined ? keptPaths : [...new Set(c.paths.map((p) => p.trim()).filter(Boolean))];
  const scoped = Array.isArray(paths) && paths.length > 0;
  return { ...rest, run: c.run, ...(folder ? { cwd: folder } : {}), ...(scoped ? { paths } : {}) };
}

/**
 * The trail lead sets the checks every completion must pass, from the Lookout (where there's no repo to edit, as in a
 * hosted workspace): verification.json is written with exactly these checks, all run in order, its other settings
 * kept (a new file turns verification on for new trails: that is what setting checks is for), and approved on this
 * machine in the same step, since the person who typed them is the one approving them, folders and paths included. Only over `base`, the file's
 * hash as they loaded it (`none` without one), so nobody's change is overwritten unseen; refused for argv that
 * carries or downloads code, and an unknown program needs `acknowledged`. Never through a symbolic link. Journaled.
 */
export function setChecks(o: { root: string; checks: CheckInput[]; base: string; acknowledged?: boolean; by: string }) {
  const now = checksApproval(o.root);
  if (o.base !== now.hash) throw new StaleChecks(`${VERIFICATION_FILE} changed since you opened it; look again`);
  const file = path.join(o.root, VERIFICATION_FILE);
  const raw = readRawConfig(file, { v: 1, default: 'checks' });
  const kept = (raw.checks ?? {}) as Kept;
  const problem = problemOf(o.checks, { acknowledged: o.acknowledged === true, kept });
  if (problem) throw new OperationError(problem);
  // A check that keeps its name keeps its other settings (a timeout, guards; its folder unless one is given).
  const checks = Object.fromEntries(o.checks.map((c) => [c.name, specOf(c, kept[c.name])]));
  const text = `${JSON.stringify({ ...raw, v: 1, checks, run: o.checks.map((c) => c.name) }, null, 2)}\n`;
  const subject = `check commands, set in the Lookout: ${o.checks.map((c) => c.name).join(', ') || 'none'}`;
  const approval = writeApprovedConfig({ root: o.root, text, by: o.by, subject });
  return approval;
}
