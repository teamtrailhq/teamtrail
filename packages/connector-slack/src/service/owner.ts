import { BRAND, SLACK_JOURNAL, type SlackOwnerAction } from '@teamtrail/core';
import { journalFile } from '@teamtrail/core/agents';
import { type SlackApi } from '../api';
import { homeView, type HomeState } from '../blocks';
import type { PendingOwner } from '../owners';
import type { SlackOwnerCode, SlackUser } from '../types';
import { gitEmail } from './gitEmail';
import { activeCode, newCode, redeemCode, type Redeemed } from './ownerCode';
import { statusOf } from './setupStatus';
import type { SlackContext } from './slackContext';

const CONNECTED = 'Connected. Decisions and questions will reach you here.';
const TRAIL_LEAD = 'trail lead';

/** Thrown for an owner change that can't be made as asked; the route answers 400 with the message. */
export class OwnerError extends Error {}

/** Owner changes go to the project's history: who, how, and whether the trail lead or Slack did it. */
function journal(ctx: SlackContext, action: SlackOwnerAction, who: SlackUser, by: 'slack' | 'lead') {
  try {
    journalFile(ctx.o.root).append({
      v: 1,
      kind: 'slack',
      at: ctx.o.now?.() ?? Date.now(),
      mapId: SLACK_JOURNAL,
      action,
      user: who.id,
      ...(who.name ? { name: who.name } : {}),
      ...(who.via ? { via: who.via } : {}),
      actor: by === 'lead' ? TRAIL_LEAD : BRAND.slug,
      actorKind: by === 'lead' ? 'trail lead' : 'engine',
    });
  } catch {
    /* the history is a record, not a gate: a tracker folder that can't be written doesn't undo the change */
  }
}

function homeState(ctx: SlackContext, user: string): HomeState {
  const c = ctx.store.read();
  const owner = c.owners[0];
  if (owner) return { kind: owner.id === user ? 'yours' : 'connected', owner: owner.id };
  if (c.pendingOwner) return { kind: c.pendingOwner.id === user ? 'confirm' : 'idle' };
  return { kind: activeCode(ctx) ? 'code' : 'idle' };
}

export async function publishHome(ctx: SlackContext, user: string) {
  const c = ctx.store.read();
  await ctx.call('views.publish', {
    user_id: user,
    view: homeView(homeState(ctx, user), { url: ctx.o.url(), command: c.command }),
  });
}

type Profile = { id: string; deleted?: boolean; is_bot?: boolean; name?: string; real_name?: string } & {
  profile?: { display_name?: string; real_name?: string };
};
const named = (u: Profile) => ({
  name: u.profile?.display_name || u.name || u.real_name,
  realName: u.real_name || u.profile?.real_name,
});

/**
 * The person running `teamtrail` is the owner, so a workspace member whose email is this machine's git email is
 * put forward right away. It still isn't the owner until the trail lead confirms it in the Lookout: a git email can
 * be a shared address, or someone else's.
 */
export async function ownerByEmail(ctx: SlackContext, api: SlackApi) {
  const email = (ctx.o.ownerEmail ?? (() => gitEmail(ctx.o.root)))()?.trim();
  if (!email) return;
  const r = await api.call<{ user?: Profile }>('users.lookupByEmail', { email }).catch(() => undefined);
  const u = r?.user;
  if (!u || u.deleted || u.is_bot) return;
  const c = ctx.store.read();
  if (c.owners.length || c.pendingOwner) return;
  const pending: PendingOwner = { id: u.id, ...named(u), via: 'git-email', at: Date.now() };
  ctx.store.update({ pendingOwner: pending });
  journal(ctx, 'owner-claimed', pending, 'slack');
}

/** `POST /slack/owner/code`: a new one-time code. Whoever was put forward before is dropped: the lead asked again. */
export function startOwnerCode(ctx: SlackContext): SlackOwnerCode {
  const c = ctx.store.read();
  if (!c.workspace || !ctx.store.tokens().bot) throw new OwnerError('Connect the Slack app first.');
  if (c.owners.length) throw new OwnerError('An owner is already confirmed. Reset the owner first.');
  if (c.pendingOwner) {
    ctx.store.update({ pendingOwner: undefined });
    journal(ctx, 'owner-reset', c.pendingOwner, 'lead');
  }
  const code = newCode(ctx);
  return { ...code, status: statusOf(ctx) };
}

/**
 * A Slack account entered a code on the Home tab. Checked and written in one step, with nothing awaited in
 * between, so of two submissions only the first is put forward. That account still waits for the trail lead.
 */
export function claimWithCode(ctx: SlackContext, user: string, input: string): Redeemed {
  const c = ctx.store.read();
  if (c.owners.length || c.pendingOwner) return 'expired';
  const result = redeemCode(ctx, user, input);
  if (result !== 'ok') return result;
  const pending: PendingOwner = { id: user, via: 'code', at: ctx.o.now?.() ?? Date.now() };
  ctx.store.update({ pendingOwner: pending });
  journal(ctx, 'owner-claimed', pending, 'slack');
  return 'ok';
}

/** After the ack: the names Slack has for the account, for the trail lead to recognise, and the Home tab. */
export async function afterClaim(ctx: SlackContext, user: string) {
  const r = await ctx.call<{ user: Profile }>('users.info', { user }).catch(() => undefined);
  const pending = ctx.store.read().pendingOwner;
  if (r?.user && pending?.id === user) ctx.store.update({ pendingOwner: { ...pending, ...named(r.user) } });
  await publishHome(ctx, user).catch(() => {});
}

/**
 * `POST /slack/owner/confirm`: the trail lead, on this machine, says the account put forward is theirs. `id` is the
 * account the Lookout showed, so a different account that got there in between is not confirmed by mistake.
 */
export async function confirmOwner(ctx: SlackContext, id: string) {
  const pending = ctx.store.read().pendingOwner;
  if (!pending || pending.id !== id) throw new OwnerError('That Slack account is no longer waiting to be confirmed.');
  const { at: _at, ...who } = pending;
  const owner: SlackUser = { ...who, confirmedAt: ctx.o.now?.() ?? Date.now() };
  ctx.store.update({ owners: [owner], pendingOwner: undefined });
  ctx.ownerCode = undefined;
  journal(ctx, 'owner-confirmed', owner, 'lead');
  await greet(ctx, owner.id);
  return statusOf(ctx);
}

/** The first message the owner gets, and their Home tab; neither failing undoes the confirmation. */
async function greet(ctx: SlackContext, user: string) {
  if (!ctx.bot) return;
  try {
    await ctx.call('chat.postMessage', { channel: await ctx.dmOf(user), text: CONNECTED });
    await publishHome(ctx, user);
  } catch {
    /* Slack is unreachable or off: questions reach the owner once it is back */
  }
}

/** `POST /slack/owner/reset`: no owner, nobody put forward, no code. Nothing is sent in Slack until a new one. */
export function resetOwner(ctx: SlackContext) {
  const c = ctx.store.read();
  const was = c.owners[0] ?? c.pendingOwner;
  ctx.store.update({ owners: [], pendingOwner: undefined });
  ctx.ownerCode = undefined;
  if (was) journal(ctx, 'owner-reset', was, 'lead');
  return statusOf(ctx);
}
