import { homeView, type HomeState } from '../blocks';
import type { SlackContext } from './slackContext';

function homeState(ctx: SlackContext, user: string): HomeState {
  const owner = ctx.store.read().owners[0];
  if (!owner) return { kind: 'idle' };
  return owner.id === user ? { kind: 'yours', owner: owner.id } : { kind: 'connected', owner: owner.id };
}

export async function publishHome(ctx: SlackContext, user: string) {
  const c = ctx.store.read();
  await ctx.call('views.publish', {
    user_id: user,
    view: homeView(homeState(ctx, user), { url: ctx.o.url(), command: c.command }),
  });
}

const CONNECTED = 'Connected. Decisions and questions will reach you here.';

/** The first message the owner gets after connecting, and their Home tab; neither failing undoes the connection. */
export async function greet(ctx: SlackContext, user: string) {
  try {
    await ctx.call('chat.postMessage', { channel: await ctx.dmOf(user), text: CONNECTED });
    await publishHome(ctx, user);
  } catch {
    /* Slack is unreachable: questions reach the owner once it is back */
  }
}
