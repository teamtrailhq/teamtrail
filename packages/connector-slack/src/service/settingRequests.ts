import type { MapSnapshot, RerouteProposal } from '@teamtrail/core';
import {
  approveReroute,
  journalFile,
  listReroutes,
  readReroute,
  rejectReroute,
  rerouteHash,
  settingAsk,
} from '@teamtrail/core/agents';
import { postResponse } from '../api';
import { label, mention } from '../blocks';
import { settingClosedMessage, settingMessage, type SettingCard, type SettingRef } from '../blocks/settingRequests';
import type { PostedSetting } from '../settingStore';
import type { SlackConfig } from '../store';
import { takeAskSlot } from './askLimit';
import { refusedForGood } from './refusedForGood';
import type { SlackContext } from './slackContext';

/*
 * An agent's request to change one of the trail lead's settings (skip discovery, the mode, the destination) gets
 * its own card with Approve and Decline, like an approval: only the confirmed owner's clicks count (interactions.ts
 * checks), approving is bound to the request as the card showed it, and the decision is the reroute flow's own
 * (journaled, kept as the trail lead's decision via Slack).
 */
const cardOf = (p: RerouteProposal, trail: string): SettingCard => ({
  mapId: p.mapId,
  id: p.id,
  hash: rerouteHash(p),
  trail,
  ask: settingAsk(p),
  why: p.evidence,
});

const OUTCOME: Record<RerouteProposal['status'], string> = {
  pending: 'Still waiting on you.',
  approved: 'No longer waiting on you: approved.',
  rejected: 'No longer waiting on you: declined.',
  superseded: 'No longer waiting on you: replaced by a newer request.',
};

async function close(ctx: SlackContext, posted: PostedSetting, line: string) {
  await ctx
    .call('chat.update', { channel: posted.channel, ts: posted.ts, ...settingClosedMessage(posted.card, line) })
    .catch(() => {});
}

/** Posts each pending setting request once; a request decided elsewhere loses its buttons. */
export async function syncSettingRequests(ctx: SlackContext, snaps: MapSnapshot[], c: SlackConfig) {
  if (!c.notify.events.includes('awaiting')) return;
  const now = new Map<string, SettingCard>();
  for (const s of snaps)
    for (const p of listReroutes(ctx.o.root, s.map.id))
      if (p.lane === 'setting' && p.status === 'pending') now.set(`${p.mapId}/${p.id}`, cardOf(p, s.map.title));
  const stored = ctx.settingRequests.read();
  for (const [key, posted] of Object.entries(stored)) {
    if (now.has(key)) continue;
    const status = readReroute(ctx.o.root, posted.card.mapId, posted.card.id)?.status;
    await close(ctx, posted, status ? OUTCOME[status] : 'No longer waiting on you.');
    delete stored[key];
  }
  for (const [key, card] of now) {
    if (stored[key] || ctx.capped.has(key)) continue;
    const channel = await ctx.target();
    if (!channel) break;
    const r = await post(ctx, { key, card, channel });
    if (r) stored[key] = { channel: r.channel ?? channel, ts: r.ts, card };
  }
  ctx.settingRequests.write(stored);
}

async function post(ctx: SlackContext, p: { key: string; card: SettingCard; channel: string }) {
  if (!takeAskSlot(ctx, `approvals:${p.card.mapId}`)) return void ctx.capped.add(p.key);
  try {
    return await ctx.call<{ ts: string; channel: string }>('chat.postMessage', {
      channel: p.channel,
      ...settingMessage(p.card, ctx.o.url()),
    });
  } catch (e) {
    if (!refusedForGood(e)) throw e;
    ctx.capped.add(p.key);
    return undefined;
  }
}

/** Approve or Decline from Slack, as the trail lead would in the Lookout. The caller checked the owner. */
export async function decideSetting(
  ctx: SlackContext,
  by: { ref: SettingRef; user: string; responseUrl?: string },
  action: 'approve' | 'decline',
) {
  const { ref, user, responseUrl } = by;
  const say = (text: string) =>
    responseUrl
      ? postResponse(responseUrl, { response_type: 'ephemeral', replace_original: false, text }, ctx.o.fetch)
      : Promise.resolve();
  const p = readReroute(ctx.o.root, ref.m, ref.id);
  if (!p || p.status !== 'pending' || rerouteHash(p) !== ref.h)
    return say('Nothing changed: this request is out of date (decided, or changed since this message).');
  const env = { root: ctx.o.root, adapter: await ctx.o.active(), journal: journalFile(ctx.o.root) };
  const d = { mapId: ref.m, id: ref.id, by: `slack:${user}` };
  try {
    if (action === 'approve') await approveReroute(env, { ...d, hash: ref.h });
    else await rejectReroute(env, { ...d, note: 'Declined in Slack.' });
  } catch (e) {
    return say(`Could not ${action}: ${label((e as Error).message)}`);
  }
  const line =
    action === 'approve' ? `✓ Approved by ${mention(user)} via Slack.` : `✕ Declined by ${mention(user)} via Slack.`;
  const stored = ctx.settingRequests.read();
  const key = `${ref.m}/${ref.id}`;
  if (stored[key]) await close(ctx, stored[key], line);
  delete stored[key];
  ctx.settingRequests.write(stored);
}
