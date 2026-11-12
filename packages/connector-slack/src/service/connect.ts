import { BRAND } from '@teamtrail/core';
import type { SlackConfig, SlackLink } from '../store';
import type { SlackConnectStart, SlackStatus, SlackUser } from '../types';
import { LINK_CODE, pkce, returnAddress } from './connectState';
import { statusOf } from './setupStatus';
import type { SlackContext } from './slackContext';
import { journalSlack } from './slackJournal';

/** Thrown for a connect step that can't be done as asked; the route answers 400 with the message. */
export class ConnectError extends Error {}

export const now = (ctx: SlackContext) => ctx.o.now?.() ?? Date.now();

/**
 * Only the process that holds this machine's Slack connection connects or disconnects it: the verifier lives in
 * its memory, and its link is the one that changes. Another `teamtrail` here refuses and says where to go.
 */
export function mustHoldConnection(ctx: SlackContext) {
  const other = ctx.lock.elsewhere() ?? (ctx.state === 'elsewhere' ? ctx.heldBy : undefined);
  if (other) throw new ConnectError(`Slack is connected from another ${BRAND.name} (${other}). Change it there.`);
}

/**
 * `POST /slack/connect/start`: a PKCE verifier kept in this process, and the address that starts Add Scout to
 * Slack at the service with its challenge and this Lookout as the place to come back to.
 */
export function startConnect(ctx: SlackContext, o: { port?: number; project?: string } = {}): SlackConnectStart {
  mustHoldConnection(ctx);
  const back = returnAddress({ ...o, lookoutUrl: ctx.o.url() });
  if (!back) throw new ConnectError(`Open the Lookout on this machine to add ${BRAND.assistant.name} to Slack.`);
  const { pending, challenge } = pkce(now(ctx));
  ctx.connecting = pending;
  return { url: ctx.scout.install({ challenge, returnUrl: back }) };
}

type Linked = {
  link: Omit<SlackLink, 'service'>;
  team: { id: string; name: string };
  user: { id: string };
  botUserId: string;
};

/** The service trades the code from the browser and our verifier for a link token. */
async function exchange(ctx: SlackContext, code: string, verifier: string): Promise<Linked> {
  const f = ctx.o.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(`${ctx.scout.http}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, verifier }),
    });
  } catch {
    throw new ConnectError(`${BRAND.assistant.name} is unreachable. Check your connection and add it again.`);
  }
  const body = (await res.json().catch(() => ({}))) as Partial<Linked>;
  if (!res.ok || !body.link?.id || !body.link.token || !body.team?.id || !body.user?.id)
    throw new ConnectError('That link expired or was already used. Choose Add Scout to Slack again.');
  return body as Linked;
}

/**
 * `POST /slack/connect/finish` `{ code }`: the browser came back from Slack's consent screen. The Slack account that
 * went through it is the owner: this machine's signed-in Lookout started it, and only this process holds the
 * verifier. A different workspace than before starts the preferences that name its people and channels over.
 */
export async function finishConnect(ctx: SlackContext, code: string): Promise<SlackStatus> {
  mustHoldConnection(ctx);
  const pending = ctx.connecting;
  ctx.connecting = undefined;
  if (!pending || pending.expiresAt < now(ctx))
    throw new ConnectError('Nothing is waiting to connect here. Choose Add Scout to Slack again.');
  if (!LINK_CODE.test(code)) throw new ConnectError('That link is not one Scout made.');
  const linked = await exchange(ctx, code, pending.verifier);
  const prev = ctx.store.read();
  const owner: SlackUser = { id: linked.user.id, via: 'oauth', confirmedAt: now(ctx) };
  ctx.stop();
  ctx.store.saveLink({ ...linked.link, service: ctx.scout.http });
  ctx.store.update({
    ...(prev.workspace?.id === linked.team.id ? {} : freshWorkspace()),
    enabled: true,
    workspace: { id: linked.team.id, name: linked.team.name },
    bot: { userId: linked.botUserId },
    owners: [owner],
  });
  journalSlack(ctx, { action: 'connected', who: owner, by: 'lead' });
  ctx.greetOwner = true;
  ctx.start();
  return statusOf(ctx);
}

/** Preferences that name people and channels of another workspace. */
const freshWorkspace = (): Partial<SlackConfig> => ({
  allow: [],
  notify: { target: 'dm', events: ['awaiting', 'blocked', 'trail.done'], detail: 'full' },
  channelTrail: {},
  appId: undefined,
});

/**
 * Tells the service the link was made with to forget it: the token goes to that service only, never to whatever
 * `$TEAMTRAIL_SCOUT_SERVICE` says now. A service that can't be reached still loses it here.
 */
async function revoke(ctx: SlackContext) {
  const link = ctx.store.link();
  if (!link?.service) return;
  const f = ctx.o.fetch ?? fetch;
  await f(`${link.service}/link`, { method: 'DELETE', headers: { Authorization: `Bearer ${link.token}` } }).catch(
    () => undefined,
  );
}

/**
 * `DELETE /slack` (Remove): the link is revoked at the service, and the link, an old app's tokens and every Slack
 * setting are deleted from this machine.
 */
export async function disconnect(ctx: SlackContext): Promise<SlackStatus> {
  mustHoldConnection(ctx);
  const owner = ctx.store.read().owners[0];
  await revoke(ctx);
  ctx.stop();
  ctx.store.clear();
  ctx.dms.clear();
  ctx.connecting = undefined;
  ctx.state = 'off';
  ctx.error = undefined;
  journalSlack(ctx, { action: 'disconnected', ...(owner ? { who: owner } : {}), by: 'lead' });
  return statusOf(ctx);
}
