import type { IncomingMessage, ServerResponse } from 'node:http';
import { secrets } from '../crypto/secrets';
import { readBody } from '../http/readBody';
import { reply } from '../http/reply';
import type { ServiceContext } from '../serviceContext';
import { botApi } from '../slack/botApi';

const INVALID = { error: 'invalid_code' };

type Profile = { user?: { name?: string; real_name?: string } };

/** The Slack username the install was done as, when Slack says; the id alone otherwise. */
async function nameOf(ctx: ServiceContext, teamId: string, userId: string) {
  try {
    const api = await botApi(ctx, teamId);
    const r = await api?.call<Profile>('users.info', { user: userId });
    return r?.user?.name;
  } catch {
    return undefined;
  }
}

/**
 * `POST /link/preview` `{ code, verifier }`: who a code from the install belongs to, without using it up, so the
 * trail lead sees "Connect as @user in <workspace>?" before anything is saved. Only the holder of the verifier
 * gets an answer, and a wrong verifier uses the code up, as `/link` does.
 */
export async function previewLink(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse) {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(await readBody(req, 4096)) as Record<string, unknown>;
  } catch {
    return reply.json(res, 400, INVALID);
  }
  const { code, verifier } = body;
  if (!secrets.wellFormed(code) || !secrets.wellFormed(verifier)) return reply.json(res, 400, INVALID);
  const hash = secrets.hash(code);
  const pending = await ctx.store.peekCode(hash, ctx.now());
  if (!pending) return reply.json(res, 400, INVALID);
  if (!secrets.verifies(verifier, pending.challenge)) {
    await ctx.store.takeCode(hash, ctx.now());
    return reply.json(res, 400, INVALID);
  }
  const workspace = await ctx.store.workspace(pending.teamId);
  if (!workspace) return reply.json(res, 400, INVALID);
  const name = await nameOf(ctx, pending.teamId, pending.userId);
  reply.json(res, 200, {
    team: { id: workspace.teamId, name: workspace.teamName },
    user: { id: pending.userId, ...(name ? { name } : {}) },
  });
}
