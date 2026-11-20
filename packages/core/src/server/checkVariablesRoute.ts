import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { CHECK_ENV_JOURNAL } from '../model/checkEnvEntry';
import { detectRepoProfile } from '../repoProfile';
import { checkEnvNames } from '../verification/checkEnvNames';
import { checkVariables } from '../verification/checkVariables';
import { TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';

export type CheckVariablesContext = Pick<RouteContext, 'root' | 'repoFiles'> & {
  configDir?: string;
  /** The environment checks are started from; this process's by default. Its values are never read for a reply. */
  env?: NodeJS.ProcessEnv;
};

async function view(ctx: CheckVariablesContext) {
  const files = ctx.repoFiles?.();
  const profile = files ? await detectRepoProfile(files) : undefined;
  const added = checkEnvNames(ctx.root, ctx.configDir).names();
  return checkVariables({ source: ctx.env ?? process.env, added, profile });
}

/** Adds or removes one name, journaled when it changed anything. */
function change(ctx: CheckVariablesContext, body: { add?: unknown; remove?: unknown }) {
  const names = checkEnvNames(ctx.root, ctx.configDir);
  const [action, name] = typeof body.add === 'string' ? ['added', body.add] : ['removed', body.remove];
  if (typeof name !== 'string' || !name) throw new BadRequest('send "add" or "remove" with a variable name');
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
 *   PUT /verification/variables  `{ add }` | `{ remove }`  one name added to or removed from this machine's list
 *     (verification/checkEnvNames.ts, the machine store, never the repo), journaled; answers the new CheckVariables
 * False when the path doesn't match.
 */
export async function handleCheckVariables(
  ctx: CheckVariablesContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  if (url.pathname !== '/verification/variables') return false;
  if (req.method === 'PUT') change(ctx, await readJson<{ add?: unknown; remove?: unknown }>(req, '{}'));
  else if (req.method !== 'GET') return false;
  sendJson(res, 200, await view(ctx));
  return true;
}
