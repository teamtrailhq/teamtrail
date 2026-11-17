import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ScreenedCheck } from '../model/checkScreening';
import { screenChecks } from '../verification/screenChecks';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { crossSite } from './trackerErrors';

const MAX_CHECKS = 20;
const MAX_WORDS = 30;
const MAX_WORD = 300;

const isWord = (a: unknown): a is string => typeof a === 'string' && a.length <= MAX_WORD;

/** One check from the body, or a 400: a name, an argv of a few words, an optional folder. */
function checkOf(v: unknown): ScreenedCheck {
  const c = (v ?? {}) as { name?: unknown; run?: unknown; cwd?: unknown };
  if (typeof c.name !== 'string' || c.name.length > 60) throw new BadRequest('each check needs a "name"');
  if (!Array.isArray(c.run) || c.run.length > MAX_WORDS || !c.run.every(isWord))
    throw new BadRequest(`"run" must be at most ${MAX_WORDS} words`);
  if (c.cwd !== undefined && !isWord(c.cwd)) throw new BadRequest('"cwd" must be a path');
  return { name: c.name, run: c.run, ...(typeof c.cwd === 'string' ? { cwd: c.cwd } : {}) };
}

/**
 * `POST /verification/screen` `{checks: [{name, run, cwd?}]}` → `{findings: CheckFinding[]}`: what reading the repo
 * says about whether each command can run (verification/screenChecks.ts), for checks being set before they're
 * saved. Read-only: nothing runs and nothing is written; refused cross-site. Without a checkout to read, no findings.
 */
export async function handleScreen(
  ctx: Pick<RouteContext, 'repoFiles'>,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (url.pathname !== '/verification/screen' || req.method !== 'POST') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const b = await readJson<{ checks?: unknown }>(req, '{}');
  if (!Array.isArray(b.checks) || b.checks.length > MAX_CHECKS)
    throw new BadRequest(`"checks" must list at most ${MAX_CHECKS} checks`);
  const checks = b.checks.map(checkOf);
  const files = ctx.repoFiles?.();
  sendJson(res, 200, { findings: files ? await screenChecks({ checks, files }) : [] });
  return true;
}
