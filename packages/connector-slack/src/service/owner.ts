import { BRAND } from '@teamtrail/core';
import { SlackApiError } from '../api';
import { homeView, type HomeState } from '../blocks';
import type { PendingOwner } from '../owners';
import type { SlackOwnerCode, SlackUser } from '../types';
import { gitEmail } from './gitEmail';
import { journalSlack } from './slackJournal';
import { activeCode, newCode, redeemCode, type Redeemed } from './ownerCode';
import { statusOf } from './setupStatus';
import type { SlackContext } from './slackContext';

const CONNECTED = 'Connected. Decisions and questions will reach you here.';

/** Thrown for an owner change that can't be made as asked; the route answers 400 with the message. */
export class OwnerError extends Error {}

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
 * Whether the account that entered the code has this machine's git email in Slack: a hint the trail lead sees
 * next to the account, never a reason to put an account forward on its own (an address can be shared, and a
 * workspace admin can give any member any email). Undefined when there is no git email or Slack won't say.
 */
async function gitEmailMatches(ctx: SlackContext, user: string): Promise<boolean | undefined> {
  const email = (ctx.o.ownerEmail ?? (() => gitEmail(ctx.o.root)))()?.trim();
  if (!email) return undefined;
  try {
    const r = await ctx.call<{ user?: Profile }>('users.lookupByEmail', { email });
    return r.user?.id === user;
  } catch (e) {
    return e instanceof SlackApiError && e.code === 'users_not_found' ? false : undefined;
  }
}

/**
 * Owner changes are made by the process that holds the Slack connection: the code lives in its memory, and only its
 * socket receives what is typed in Slack. Another `teamtrail` on this machine refuses and says where to go.
 */
function mustHoldConnection(ctx: SlackContext) {
  const other = ctx.lock.elsewhere() ?? (ctx.state === 'elsewhere' ? ctx.heldBy : undefined);
  if (other)
    throw new OwnerError(
      `Slack is connected from another ${BRAND.name} (${other}). Change the Slack owner in that Lookout.`,
    );
}

/** `POST /slack/owner/code`: a new one-time code. Whoever was put forward before is dropped: the lead asked again. */
export function startOwnerCode(ctx: SlackContext): SlackOwnerCode {
  mustHoldConnection(ctx);
  const c = ctx.store.read();
  if (!c.workspace || !ctx.store.tokens().bot) throw new OwnerError('Connect the Slack app first.');
  if (!ctx.socket) throw new OwnerError('Turn Slack on first: the code is entered in Slack, while Scout is connected.');
  if (c.owners.length) throw new OwnerError('An owner is already confirmed. Reset the owner first.');
  if (c.pendingOwner) {
    ctx.store.update({ pendingOwner: undefined });
    journalSlack(ctx, { action: 'owner-reset', who: c.pendingOwner, by: 'lead' });
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
  journalSlack(ctx, { action: 'owner-claimed', who: pending, by: 'slack' });
  return 'ok';
}

/**
 * After the ack: what the trail lead needs to recognise the account (its handle and name, and whether its email is
 * this machine's git email), and the Home tab.
 */
export async function afterClaim(ctx: SlackContext, user: string) {
  const r = await ctx.call<{ user: Profile }>('users.info', { user }).catch(() => undefined);
  const gitEmail = await gitEmailMatches(ctx, user);
  const pending = ctx.store.read().pendingOwner;
  if (pending?.id === user)
    ctx.store.update({
      pendingOwner: { ...pending, ...(r?.user ? named(r.user) : {}), ...(gitEmail === undefined ? {} : { gitEmail }) },
    });
  await publishHome(ctx, user).catch(() => {});
}

/**
 * `POST /slack/owner/confirm`: the trail lead, on this machine, says the account put forward is theirs. `id` is the
 * account the Lookout showed, so a different account that got there in between is not confirmed by mistake.
 */
export async function confirmOwner(ctx: SlackContext, id: string) {
  mustHoldConnection(ctx);
  const pending = ctx.store.read().pendingOwner;
  if (!pending || pending.id !== id) throw new OwnerError('That Slack account is no longer waiting to be confirmed.');
  const { at: _at, gitEmail: _hint, ...who } = pending;
  const owner: SlackUser = { ...who, confirmedAt: ctx.o.now?.() ?? Date.now() };
  ctx.store.update({ owners: [owner], pendingOwner: undefined, ownerRedo: undefined });
  ctx.ownerCode = undefined;
  journalSlack(ctx, { action: 'owner-confirmed', who: owner, by: 'lead' });
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
  mustHoldConnection(ctx);
  const c = ctx.store.read();
  const was = c.owners[0] ?? c.pendingOwner;
  ctx.store.update({ owners: [], pendingOwner: undefined, ownerRedo: undefined });
  ctx.ownerCode = undefined;
  ctx.ownerCodeDropped = undefined;
  if (was) journalSlack(ctx, { action: 'owner-reset', who: was, by: 'lead' });
  return statusOf(ctx);
}
