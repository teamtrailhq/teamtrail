import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { secrets } from '../crypto/secrets';
import { readBody } from '../http/readBody';
import { reply } from '../http/reply';
import { LIMITS } from '../limits';
import type { ServiceContext } from '../serviceContext';

const INVALID = { error: 'invalid_code' };

async function parse(req: IncomingMessage) {
  try {
    const body = JSON.parse(await readBody(req, 4096)) as Record<string, unknown>;
    return { code: body.code, verifier: body.verifier };
  } catch {
    return {};
  }
}

/** Keeps a person's links under the cap: the oldest go first, and their sockets close. */
async function makeRoom(ctx: ServiceContext, teamId: string, userId: string) {
  const links = await ctx.store.linksOf(teamId, userId);
  const extra = links.slice(0, Math.max(0, links.length - LIMITS.linksPerUser + 1));
  for (const l of extra) await ctx.store.removeLink(l.id);
  ctx.hub.revoke(
    extra.map((l) => l.id),
    'replaced',
  );
}

/**
 * `POST /link` `{ code, verifier }`: the Lookout's server trades the code from the install for a link token.
 * The code works once, for a minute, and only with the verifier of the challenge the install started with, so
 * a code seen in a browser's history or by another program is useless.
 */
export async function createLink(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse) {
  const { code, verifier } = await parse(req);
  if (!secrets.wellFormed(code) || !secrets.wellFormed(verifier)) return reply.json(res, 400, INVALID);
  const pending = await ctx.store.takeCode(secrets.hash(code), ctx.now());
  const verified = pending && secrets.verifies(verifier, pending.challenge);
  const workspace = verified ? await ctx.store.workspace(pending.teamId) : undefined;
  if (!pending || !workspace) return reply.json(res, 400, INVALID);
  await makeRoom(ctx, pending.teamId, pending.userId);
  const token = secrets.random('stl_');
  const id = `L${randomBytes(8).toString('hex')}`;
  await ctx.store.saveLink({
    id,
    teamId: pending.teamId,
    userId: pending.userId,
    tokenHash: secrets.hash(token),
    createdAt: ctx.now(),
  });
  ctx.log('link.created', { link: id, team: pending.teamId });
  reply.json(res, 200, {
    link: { id, token },
    team: { id: workspace.teamId, name: workspace.teamName },
    user: { id: pending.userId },
    botUserId: workspace.botUserId,
  });
}
