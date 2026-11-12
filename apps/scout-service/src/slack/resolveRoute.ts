import type { ServiceContext } from '../serviceContext';
import type { Link } from '../types';
import type { Route } from './interactionRoute';

/** The links a request may go to, or `stale` when what it came from is no longer any link's. */
export type Targets = { kind: 'links'; ids: string[] } | { kind: 'stale' };

interface Request {
  route: Route;
  teamId: string;
  userId: string;
}

async function linksOf(ctx: ServiceContext, ids: string[]) {
  const links = await Promise.all(ids.map((id) => ctx.store.link(id)));
  return links.filter((l): l is Link => !!l);
}

/** Only the link on record as the poster, while it exists, in the clicker's workspace, and agreeing with any stamp. */
async function poster(ctx: ServiceContext, r: Request & { route: Extract<Route, { by: 'message' }> }) {
  const ids = await ctx.store.marked('message', `${r.route.channel}:${r.route.ts}`, ctx.now());
  const links = await linksOf(ctx, ids);
  const stamp = r.route.stamp;
  return links.filter((l) => l.teamId === r.teamId && (stamp === undefined || stamp === l.id)).map((l) => l.id);
}

/** Only the acting user's own link that opened the view. */
async function opener(ctx: ServiceContext, r: Request & { route: Extract<Route, { by: 'view' }> }) {
  const links = await linksOf(ctx, await ctx.store.marked('view', r.route.viewId, ctx.now()));
  return links.filter((l) => l.teamId === r.teamId && l.userId === r.userId).map((l) => l.id);
}

/**
 * Where Slack's request may go. A click never falls back to the clicker's own Teamtrail: a message or view that
 * isn't on record as a link's (forged through a `response_url`, or its link disconnected or replaced) is stale.
 */
export async function resolveRoute(ctx: ServiceContext, r: Request): Promise<Targets> {
  const route = r.route;
  switch (route.by) {
    case 'user':
      return { kind: 'links', ids: (await ctx.store.linksOf(r.teamId, r.userId)).map((l) => l.id) };
    case 'message': {
      const ids = await poster(ctx, { ...r, route });
      return ids.length ? { kind: 'links', ids } : { kind: 'stale' };
    }
    case 'view': {
      const ids = await opener(ctx, { ...r, route });
      return ids.length ? { kind: 'links', ids } : { kind: 'stale' };
    }
    case 'none':
      return { kind: 'stale' };
    default: {
      const never: never = route;
      return never;
    }
  }
}
