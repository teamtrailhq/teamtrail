import { greet } from './home';
import type { SlackContext } from './slackContext';
import type { Payload } from './types';

type AuthTest = { team_id: string; team: string; url?: string; user_id: string; user?: string; bot_id?: string };

/**
 * Once the link is ready: what Slack says about the workspace, Scout's bot and app, and the owner's names, for
 * Settings and the links to Scout's Home tab. The owner is greeted on the first ready after connecting.
 */
export async function learnWorkspace(ctx: SlackContext) {
  const who = await ctx.call<AuthTest>('auth.test');
  const bot = who.bot_id
    ? await ctx.call<{ bot?: { app_id?: string } }>('bots.info', { bot: who.bot_id }).catch(() => undefined)
    : undefined;
  const c = ctx.store.read();
  const owner = c.owners[0];
  const profile = owner
    ? await ctx.call<{ user?: Payload }>('users.info', { user: owner.id }).catch(() => undefined)
    : undefined;
  const u = profile?.user;
  ctx.store.update({
    workspace: { id: who.team_id, name: who.team, ...(who.url ? { url: who.url } : {}) },
    bot: { userId: who.user_id, ...(who.user ? { name: who.user } : {}) },
    ...(bot?.bot?.app_id ? { appId: bot.bot.app_id } : {}),
    ...(owner && u
      ? {
          owners: [
            {
              ...owner,
              ...(u.name ? { name: u.name as string } : {}),
              ...(u.real_name ? { realName: u.real_name as string } : {}),
              ...(u.profile?.display_name ? { displayName: u.profile.display_name as string } : {}),
            },
          ],
        }
      : {}),
  });
  if (ctx.greetOwner && owner) {
    ctx.greetOwner = false;
    await greet(ctx, owner.id);
  }
}
