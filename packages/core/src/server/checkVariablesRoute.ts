import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { secretShapedName } from '../lib/secretShapedName';
import { CHECK_ENV_JOURNAL } from '../model/checkEnvEntry';
import { detectRepoProfile } from '../repoProfile';
import { checkEnvNameProblem } from '../verification/checkEnvNameProblem';
import { checkEnvNames } from '../verification/checkEnvNames';
import { checkVariables } from '../verification/checkVariables';
import { TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';

export type CheckVariablesContext = Pick<RouteContext, 'root' | 'repoFiles'> & {
  configDir?: string;
  /** The environment checks are started from; this process's by default. Its values are never read for a reply. */
  env?: NodeJS.ProcessEnv;
};

/** A change that waits for the person's acknowledgement: 409 with `acknowledge: true`. */
class Acknowledge extends Error {}

async function view(ctx: CheckVariablesContext) {
  const files = ctx.repoFiles?.();
  const profile = files ? await detectRepoProfile(files) : undefined;
  const added = checkEnvNames(ctx.root, ctx.configDir).names();
  return checkVariables({ source: ctx.env ?? process.env, added, profile });
}

type ChangeBody = { add?: unknown; remove?: unknown; acknowledged?: unknown };

/** Why adding a name that reads like a credential needs the person's acknowledgement first. */
const secretNote = (name: string) =>
  `${name} reads like a credential. Any code your checks run can read it, and agents write that code: give it a test value only. Add it again with acknowledged: true.`;

/**
 * Adds or removes one name, journaled when it changed anything. A name that reads like a credential is added only with
 * `acknowledged`, so a click never lets checks read one unawares.
 */
function change(ctx: CheckVariablesContext, body: ChangeBody) {
  const names = checkEnvNames(ctx.root, ctx.configDir);
  const [action, name] = typeof body.add === 'string' ? ['added', body.add] : ['removed', body.remove];
  if (typeof name !== 'string' || !name) throw new BadRequest('send "add" or "remove" with a variable name');
  const problem = action === 'added' ? checkEnvNameProblem(name) : undefined;
  if (problem) throw new BadRequest(problem);
  if (action === 'added' && secretShapedName(name) && body.acknowledged !== true)
    throw new Acknowledge(secretNote(name));
  let changed: boolean;
  try {
    changed = action === 'added' ? names.add(name) : names.remove(name);
  } catch (e) {
    throw new BadRequest((e as Error).message);
  }
  if (!changed) return;
  journalFile(ctx.root).append({
    v: 1,
    kind: 'check-env',
    at: Date.now(),
    mapId: CHECK_ENV_JOURNAL,
    action: action as 'added' | 'removed',
    name,
    actor: TRAIL_LEAD,
    actorKind: 'trail lead',
  });
}

/**
 * Settings → Verification → Variables checks can read, this machine only (thisMachineRoutes.ts), reads included:
 *   GET /verification/variables                      CheckVariables: names only, never a value
 *   PUT /verification/variables  `{ add, acknowledged? }` | `{ remove }`  one name added to or removed from this
 *     machine's list (verification/checkEnvNames.ts, the machine store, never the repo), journaled; answers the new
 *     CheckVariables. A name that reads like a credential needs `acknowledged: true` (else 409 `acknowledge`).
 * False when the path doesn't match.
 */
export async function handleCheckVariables(
  ctx: CheckVariablesContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname !== '/verification/variables') return false;
  if (req.method === 'PUT') {
    if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
    try {
      change(ctx, await readJson<ChangeBody>(req, '{}'));
    } catch (e) {
      if (!(e instanceof Acknowledge)) throw e;
      return (sendJson(res, 409, { error: e.message, acknowledge: true }), true);
    }
  } else if (req.method !== 'GET') return false;
  sendJson(res, 200, await view(ctx));
  return true;
}
