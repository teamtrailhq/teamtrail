import { BRAND, firstSentence, recordDecision, resolve, type DecisionSource, type Ticket } from '@teamtrail/core';
import { postResponse } from '../api';
import { ACTIONS, clip, escape, md, type SaveMode } from '../blocks';
import { day } from './constants';
import type { SlackContext } from './slackContext';
import type { DecisionMeta } from './types';

export async function saveDecision(
  ctx: SlackContext,
  s: {
    meta: DecisionMeta;
    user: string;
    mapId: string;
    mode: SaveMode;
    ticketId?: string;
    decision: string;
    summary: string;
  },
) {
  const { meta } = s;
  const adapter = await ctx.o.active();
  const decidedBy = `slack:${s.user}`;
  const at = Date.now();
  const source: DecisionSource = {
    kind: 'slack',
    ref: `${meta.c}/${meta.m ?? `cmd-${at}`}`,
    ...(meta.l ? { url: meta.l } : {}),
    ...(meta.cn ? { label: `#${meta.cn}` } : {}),
    meta: {
      workspaceId: meta.w,
      channelId: meta.c,
      ...(meta.cn ? { channelName: meta.cn } : {}),
      ...(meta.t ? { threadTs: meta.t } : {}),
      ...(meta.m ? { messageTs: meta.m } : {}),
    },
  };
  const participants = (meta.p ?? []).map(([id, name]) => ({ id: `slack:${id}`, name }));
  if (!participants.some((p) => p.id === decidedBy))
    participants.push({ id: decidedBy, name: await ctx.nameOf(s.user) });
  const line = `${firstSentence(s.decision)}${meta.l ? ` ([Slack](${meta.l}), ${day(at)})` : ` (Slack, ${day(at)})`}`;
  const fields = { decidedBy, participants, source, ...(s.summary ? { rationale: s.summary } : {}) };
  let resolved: Ticket | undefined;
  let title = s.mapId;
  try {
    const snap = await adapter.loadMap(s.mapId);
    title = snap.map.title;
    if (s.mode === 'trail') {
      await recordDecision(
        adapter,
        s.mapId,
        {
          question: `Slack thread${meta.cn ? ` in #${meta.cn}` : ''}`,
          answer: s.decision,
          summary: firstSentence(s.decision),
          ...fields,
        },
        { trailLine: line },
      );
    } else {
      const ticketId =
        s.mode === 'resolve'
          ? s.ticketId!
          : (
              await adapter.createTicket(s.mapId, {
                title: clip(firstSentence(s.decision), 80),
                type: 'junction',
                body: `Recorded from Slack${meta.cn ? ` (#${meta.cn})` : ''}.${meta.l ? `\n\n${meta.l}` : ''}\n\nPart of trail ${snap.map.key}.`,
              })
            ).id;
      resolved = await resolve(adapter, s.mapId, ticketId, {
        answer: s.decision,
        author: decidedBy,
        summary: firstSentence(s.decision),
        decision: fields,
        trailLine: line,
      });
    }
  } catch (e) {
    await tell(ctx, meta, `Couldn't save the decision: ${escape((e as Error).message)}`);
    return;
  }
  ctx.store.update({ channelTrail: { ...ctx.store.read().channelTrail, [meta.c]: s.mapId } });
  const url = ctx.o.url();
  const text = `Saved to *${escape(title)}*${resolved ? `, resolved ${escape(resolved.key)} ${escape(resolved.title)}` : ''}`;
  await tell(
    ctx,
    meta,
    text,
    url
      ? [
          { type: 'section', text: md(text) },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                action_id: ACTIONS.open,
                text: { type: 'plain_text', text: `Open in ${BRAND.name}` },
                url,
              },
            ],
          },
        ]
      : undefined,
  );
}

/** Confirmation: a thread reply for shortcuts, ephemeral for the slash command, the user's DM as the fallback. */
export async function tell(ctx: SlackContext, meta: DecisionMeta, text: string, blocks?: unknown[]) {
  if (meta.r)
    return postResponse(meta.r, { response_type: 'ephemeral', text, ...(blocks ? { blocks } : {}) }, ctx.o.fetch);
  try {
    await ctx.call('chat.postMessage', { channel: meta.c, thread_ts: meta.t, text, ...(blocks ? { blocks } : {}) });
  } catch {
    await ctx
      .call('chat.postMessage', {
        channel: await ctx.dmOf(meta.u),
        text,
        ...(blocks ? { blocks } : {}),
      })
      .catch(() => {});
  }
}
