import type { IncomingMessage, ServerResponse } from 'node:http';
import type { RepoFiles } from '../model/checkScreening';
import { OperationError } from '../planning/operations/operationError';
import { checkFolderProblem } from '../verification/checkFolder';
import { checksApproval } from '../verification/checksApproval';
import { readVerificationConfig, VERIFICATION_FILE } from '../verification/configFile';
import { screenConfig } from '../verification/screenConfig';
import { setChecks, StaleChecks, type CheckInput } from '../verification/setChecks';
import { BadRequest, readJson, sendJson } from './http';
import { personOfRequest } from './requestPerson';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

type Options = { root: string; local?: boolean; repoFiles?: () => RepoFiles | undefined };

/** One check from the body: its name, argv and, when given, its folder. */
function inputOf(v: unknown): CheckInput {
  const c = (v ?? {}) as { name?: unknown; run?: unknown; cwd?: unknown };
  if (c.cwd !== undefined && typeof c.cwd !== 'string') throw new BadRequest('"cwd" must be a path');
  return { name: String(c.name ?? ''), run: c.run as string[], ...(typeof c.cwd === 'string' ? { cwd: c.cwd } : {}) };
}

/** The first check whose folder isn't a real folder inside the repo (verification/checkFolder.ts), as an error. */
async function folderProblem(checks: CheckInput[], o: Options): Promise<string | undefined> {
  const files = o.repoFiles?.();
  for (const c of checks) {
    if (c.cwd === undefined) continue;
    const problem = await checkFolderProblem({ cwd: c.cwd, files });
    if (problem) return `${c.name}: ${problem}`;
  }
  return undefined;
}

/**
 * `PUT /verification/config` `{checks: [{name, run, cwd?}], base, acknowledged?}`: the trail lead sets the check
 * commands and their folders and approves them in one step (verification/setChecks.ts); a folder must be a real
 * folder inside the repo, no symbolic link on the way (checkFolder.ts). This machine only (thisMachineRoutes.ts),
 * never cross-site; who did it is the sign-in's person (requestPerson.ts), never the body's. 409 when the file
 * changed since `base`.
 */
async function putChecks(o: Options, req: IncomingMessage, res: ServerResponse) {
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  if (o.local === false) return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
  const b = await readJson<{ checks?: unknown; base?: unknown; acknowledged?: unknown }>(req, '{}');
  if (!Array.isArray(b.checks) || typeof b.base !== 'string') throw new BadRequest('"checks" and "base" are required');
  const checks = b.checks.map(inputOf);
  const badFolder = await folderProblem(checks, o);
  if (badFolder) return (sendJson(res, 400, { error: badFolder }), true);
  try {
    const by = personOfRequest(req)?.name ?? 'trail lead';
    const approval = setChecks({ root: o.root, checks, base: b.base, acknowledged: b.acknowledged === true, by });
    sendJson(res, 200, { approval: { state: approval.state, waiting: approval.waiting }, hash: approval.hash });
  } catch (e) {
    if (!(e instanceof OperationError)) throw e;
    sendJson(res, e instanceof StaleChecks ? 409 : 400, { error: e.message });
  }
  return true;
}

/**
 * `/verification/config`: GET the parsed file, whether its commands are approved on this machine, the `base` a
 * change must name and `screening`, what reading the repo says about each check (CheckFinding[]); PUT to set the
 * checks (putChecks).
 */
export async function handleChecksConfig(o: Options, req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'PUT') return putChecks(o, req, res);
  if (req.method !== 'GET') return false;
  const { exists, errors, hash, config } = readVerificationConfig(o.root);
  // Whether its commands run on this machine yet: only once the trail lead approved this exact file here. `base`:
  // what a change from the Lookout must name, the file as this read saw it (setChecks.ts).
  const { state, waiting, hash: base } = checksApproval(o.root);
  // what reading the repo says about each check's command (advice, verification/screenChecks.ts)
  const screening = await screenConfig({ config, files: o.repoFiles?.() });
  sendJson(res, 200, {
    file: VERIFICATION_FILE,
    exists,
    errors,
    hash,
    config,
    approval: { state, waiting, base },
    screening,
  });
  return true;
}
