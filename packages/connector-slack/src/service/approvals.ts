import { BRAND, derivePhases, type ApprovalItem, type MapSnapshot } from '@teamtrail/core';
import { approvalItems, needsLookout } from '@teamtrail/core/agents';
import { postResponse } from '../api';
import { approvalClosedMessage, approvalMessage, label, type ApprovalRef } from '../blocks';
import type { SlackConfig } from '../store';
import { takeAskSlot } from './askLimit';
import { queueLine } from './queueLine';
import { refusedForGood } from './refusedForGood';
import type { SlackContext } from './slackContext';
import type { PostedApproval } from './types';

const keyOf = (i: Pick<ApprovalItem, 'mapId' | 'ticketId' | 'attemptId' | 'kind'>) =>
  `${i.mapId}/${i.ticketId}/${i.attemptId ?? ''}/${i.kind}`;

const PHASE_LINE: Record<string, string> = {
  done: 'is done',
  cancelled: 'was cancelled',
  rework: 'went back to rework',
  verifying: 'is being verified again',
  blocked: 'is held for you',
  ready: 'is back in the queue',
  working: 'is being worked on',
  backlog: 'is in the backlog',
};

/** What became of a ticket that stopped waiting, for the message that loses its buttons. */
function outcome(snap: MapSnapshot | undefined, i: ApprovalItem) {
  const phase = snap && derivePhases(snap.tickets, snap.map.mode).get(i.ticketId);
  return phase
    ? `No longer waiting on you: ${label(i.ticketKey)} ${PHASE_LINE[phase] ?? `is ${label(phase)}`}.`
    : 'No longer waiting on you.';
}

async function close(ctx: SlackContext, posted: PostedApproval, line: string) {
  await ctx
    .call('chat.update', {
      channel: posted.channel,
      ts: posted.ts,
      ...approvalClosedMessage(posted.trail, posted.item, line),
    })
    .catch(() => {});
}

/** Strips the buttons from every stored message of a ticket and forgets them. */
export async function closeTicket(ctx: SlackContext, mapId: string, ticketId: string, line: string) {
  const stored = ctx.approvals.read();
  for (const [key, posted] of Object.entries(stored))
    if (posted.item.mapId === mapId && posted.item.ticketId === ticketId) {
      await close(ctx, posted, line);
      delete stored[key];
      ctx.approvals.write(stored);
    }
}

/**
 * Posts each ticket that starts waiting on the trail lead (a reviewed pass to
 * approve, a held ticket) once. Messages are kept in the tracker folder: after
 * a restart they are updated in place, and a ticket that stopped waiting gets
 * its outcome and loses the buttons. Part of the "awaiting" notifications.
 */
export async function syncApprovals(ctx: SlackContext, snaps: MapSnapshot[], c: SlackConfig) {
  if (!c.notify.events.includes('awaiting')) return;
  const byMap = new Map(snaps.map((s) => [s.map.id, s]));
  const now = new Map<string, { item: ApprovalItem; trail: string }>();
  for (const s of snaps)
    for (const i of approvalItems(ctx.o.root, s)) now.set(keyOf(i), { item: i, trail: s.map.title });
  const stored = ctx.approvals.read();
  for (const [key, posted] of Object.entries(stored))
    if (!now.has(key)) {
      await close(ctx, posted, outcome(byMap.get(posted.item.mapId), posted.item));
      delete stored[key];
      ctx.approvals.write(stored);
    }
  for (const [key, { item, trail }] of now) {
    const posted = stored[key];
    if (posted && ctx.refreshed.has(key)) continue;
    const mode = needsLookout.approval(ctx.o.root, item) ? 'lookout' : 'buttons';
    const message = approvalMessage(trail, item, ctx.o.url(), mode);
    if (posted) {
      const updated = await ctx.call('chat.update', { channel: posted.channel, ts: posted.ts, ...message }).then(
        () => true,
        () => false,
      );
      ctx.refreshed.add(key);
      if (updated) {
        stored[key] = { ...posted, item, trail };
        ctx.approvals.write(stored);
        continue;
      }
    }
    if (ctx.capped.has(key)) continue;
    const channel = await ctx.target();
    if (!channel) return;
    const r = await postApproval(ctx, { key, item, channel, message });
    if (!r) continue;
    stored[key] = { channel: r.channel ?? channel, ts: r.ts, item, trail };
    ctx.refreshed.add(key);
    ctx.approvals.write(stored);
  }
}

/**
 * A new approval card, within the same limit as agent questions (three per trail in ten minutes, askLimit.ts). Past
 * it, or when Slack refuses the card, the ticket is one line in the trail's digest, once, and waits in the Lookout.
 */
async function postApproval(
  ctx: SlackContext,
  p: { key: string; item: ApprovalItem; channel: string; message: ReturnType<typeof approvalMessage> },
) {
  const { key, item } = p;
  const inDigest = () => {
    ctx.capped.add(key);
    const kind = item.kind === 'approve' ? 'Approve' : 'Held';
    queueLine(ctx, item.mapId, `${kind} · ${label(item.ticketKey)} ${label(item.title)} (decide in ${BRAND.name})`);
  };
  if (!takeAskSlot(ctx, `approvals:${item.mapId}`)) return void inDigest();
  try {
    return await ctx.call<{ ts: string; channel: string }>('chat.postMessage', { channel: p.channel, ...p.message });
  } catch (e) {
    if (!refusedForGood(e)) throw e;
    inDigest();
    return undefined;
  }
}

/**
 * The approval a button is about, if it still waits: same ticket, same
 * attempt, and still a reviewed pass for Approve. A button from a message that
 * is out of date is refused, and its message closed with the outcome.
 */
export async function waitingApproval(
  ctx: SlackContext,
  ref: ApprovalRef,
  action: 'approve' | 'rework',
  responseUrl?: string,
): Promise<ApprovalItem | undefined> {
  const snap = await (await ctx.o.active()).loadMap(ref.m).catch(() => undefined);
  const item = snap
    ? approvalItems(ctx.o.root, snap).find(
        (i) => i.ticketId === ref.t && i.attemptId === ref.a && (action === 'rework' || i.kind === 'approve'),
      )
    : undefined;
  if (item) return item;
  const t = snap?.tickets.find((x) => x.id === ref.t);
  const stale = { mapId: ref.m, ticketId: ref.t, ticketKey: t?.key ?? ref.t } as ApprovalItem;
  const line = outcome(snap, stale);
  await postResponse(
    responseUrl,
    {
      response_type: 'ephemeral',
      replace_original: false,
      text: `Nothing changed: this message is out of date. ${line.replace('No longer waiting on you: ', '')}`,
    },
    ctx.o.fetch,
  );
  await closeTicket(ctx, ref.m, ref.t, line);
  return undefined;
}
