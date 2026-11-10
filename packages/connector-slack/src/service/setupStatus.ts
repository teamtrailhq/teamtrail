import { slackLinks } from '../manifest';
import type { PendingOwner } from '../owners';
import type { SlackStatus, SlackUser } from '../types';
import { activeCode, wrongTries } from './ownerCode';
import type { SlackContext } from './slackContext';

export function statusOf(ctx: SlackContext): SlackStatus {
  const c = ctx.store.read();
  const t = ctx.store.tokens();
  const code = activeCode(ctx);
  const step = setupStep({ created: c.created, app: !!t.app, bot: !!t.bot, owners: c.owners.length });
  return {
    state: ctx.state,
    error: ctx.error,
    enabled: c.enabled,
    step,
    setup: {
      created: c.created || !!t.app,
      appId: c.appId,
      appToken: t.app?.source ?? null,
      botToken: t.bot?.source ?? null,
    },
    workspace: c.workspace,
    bot: c.bot,
    owners: c.owners,
    ...(c.pendingOwner ? { pendingOwner: pendingView(c.pendingOwner) } : {}),
    ...(code ? { ownerCode: { expiresAt: code.expiresAt, wrongTries: wrongTries(ctx, code.tries) } } : {}),
    ...(ctx.ownerCodeDropped ? { ownerCodeDropped: { by: wrongTries(ctx, ctx.ownerCodeDropped) } } : {}),
    ...(c.ownerRedo ? { ownerRedo: c.ownerRedo } : {}),
    allow: c.allow,
    notify: c.notify,
    command: c.command,
    links: {
      create: slackLinks.create(c.command),
      ...(c.appId ? { app: slackLinks.app(c.appId), install: slackLinks.install(c.appId) } : {}),
      ...(c.appId && c.workspace
        ? { home: slackLinks.home(c.workspace.id, c.appId), homeWeb: slackLinks.homeWeb(c.workspace.id, c.appId) }
        : {}),
    },
    ...(ctx.heldBy ? { heldBy: ctx.heldBy } : {}),
  };
}

/** The account put forward, as the Lookout shows it. */
function pendingView(p: PendingOwner): SlackUser {
  return {
    id: p.id,
    ...(p.name ? { name: p.name } : {}),
    ...(p.realName ? { realName: p.realName } : {}),
    via: p.via,
    ...(p.gitEmail === undefined ? {} : { gitEmail: p.gitEmail }),
  };
}

/** The setup step to show: create the app, paste the app token, paste the bot token, confirm the owner, done. */
function setupStep(s: { created: boolean; app: boolean; bot: boolean; owners: number }): SlackStatus['step'] {
  if (!s.app) return s.created ? 2 : 1;
  if (!s.bot) return 4;
  if (!s.owners) return 5;
  return 'done';
}
