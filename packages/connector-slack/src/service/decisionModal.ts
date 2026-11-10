import { BRAND, type AgentSessionDoc, type MapSnapshot, type Ticket, type TrackerAdapter } from '@teamtrail/core';
import { readAgentDocs } from '@teamtrail/core/bridge';
import { SlackApiError } from '../api';
import { clip, decisionModal, label, loadingModal, noticeModal, type DecisionForm } from '../blocks';
import { deterministicSummary, plainText, type ThreadMessage } from '../summary';
import { isDecisionTicket } from './constants';
import type { SlackContext } from './slackContext';
import type { Payload, DecisionMeta } from './types';

export async function openDecision(ctx: SlackContext, trigger: string, meta: DecisionMeta, prefill: string) {
  const opened = await ctx.call<{ view: { id: string } }>('views.open', {
    trigger_id: trigger,
    view: loadingModal(JSON.stringify(meta)),
  });
  const viewId = opened.view.id;
  const adapter = await ctx.o.active();
  const maps = await adapter.listMaps();
  if (!maps.length) {
    await ctx.call('views.update', {
      view_id: viewId,
      view: noticeModal(JSON.stringify(meta), `No trails yet. Start one in ${BRAND.name}, then save this again.`),
    });
    return;
  }
  let messages: ThreadMessage[] = [];
  if (meta.t) {
    let replies: { messages: Payload[] };
    try {
      replies = await ctx.call('conversations.replies', { channel: meta.c, ts: meta.t, limit: 200 });
    } catch (e) {
      const code = e instanceof SlackApiError ? e.code : '';
      const text =
        code === 'not_in_channel' || code === 'channel_not_found'
          ? `Invite @${BRAND.assistant.name} to ${meta.cn ? `#${label(meta.cn)}` : 'this conversation'} to save threads here: \`/invite @${BRAND.assistant.name}\``
          : `Couldn't read the thread (${label(code || 'error')}).`;
      await ctx.call('views.update', { view_id: viewId, view: noticeModal(JSON.stringify(meta), text) });
      return;
    }
    const human = replies.messages.filter((m) => m.user && !m.bot_id).slice(0, 200);
    const ids = [...new Set(human.map((m) => m.user as string))];
    const names = Object.fromEntries(await Promise.all(ids.map(async (id) => [id, await ctx.nameOf(id)] as const)));
    messages = human.map((m) => ({
      ts: m.ts,
      user: m.user,
      name: names[m.user],
      text: plainText(String(m.text ?? ''), names),
    }));
    meta.p = ids.slice(0, 15).map((id) => [id, clip(names[id], 40)]);
    meta.l = (
      await ctx.call<{ permalink: string }>('chat.getPermalink', { channel: meta.c, message_ts: meta.m ?? meta.t })
    ).permalink;
  } else {
    const ws = ctx.store.read().workspace;
    if (ws) meta.l = `${ws.url.replace(/\/$/, '')}/archives/${meta.c}`;
  }
  const summary = deterministicSummary(messages, meta.m);
  const asks = ctx.asks.read();
  const inThread = meta.t ? Object.values(asks).find((a) => a.channel === meta.c && a.ts === meta.t) : undefined;
  meta.mid = [inThread?.view?.mapId, ctx.store.read().channelTrail[meta.c], maps[0].id].find(
    (id) => id && maps.some((m) => m.id === id),
  )!;
  const form = await decisionForm(
    ctx,
    adapter,
    { maps, mapId: meta.mid },
    {
      decision: prefill,
      summary,
      related: inThread?.view?.ticketId,
      count: messages.length,
      meta,
    },
  );
  await ctx.call('views.update', { view_id: viewId, view: decisionModal(form, JSON.stringify(meta)) });
}

export async function decisionForm(
  ctx: SlackContext,
  adapter: TrackerAdapter,
  target: { maps: { id: string; key: string; title: string }[]; mapId: string },
  o: { decision: string; summary: string; related?: string; count: number; meta: DecisionMeta },
): Promise<DecisionForm> {
  const { maps, mapId } = target;
  const snap = await adapter.loadMap(mapId);
  const docs = await readAgentDocs(ctx.o.root);
  const related = relatedTicket(snap, docs, o.related);
  const tickets = snap.tickets.filter((t) => isDecisionTicket(t) || t.id === related?.id);
  return {
    trails: maps.map((m) => ({ id: m.id, label: `${m.key} ${m.title}` })),
    mapId,
    tickets: tickets.map((t) => ({ id: t.id, label: `${t.key} ${t.title}` })),
    ticketId: related?.id,
    mode: related ? 'resolve' : 'new',
    decision: o.decision,
    summary: o.summary,
    thread: o.meta.t
      ? { channel: o.meta.cn, count: o.count, participants: (o.meta.p ?? []).map(([, n]) => n), permalink: o.meta.l }
      : undefined,
    postsTo: `${adapter.label} · trail ${snap.map.key}${related ? ` · ${related.key}` : ''}`,
  };
}

/** The ticket a Slack decision resolves by default; first match wins (see the plan, §3). */
export function relatedTicket(snap: MapSnapshot, docs: AgentSessionDoc[], askTicket?: string): Ticket | undefined {
  const open = snap.tickets.filter((t) => t.state === 'open');
  const byId = (id?: string) => open.find((t) => t.id === id);
  if (byId(askTicket)) return byId(askTicket);
  const waiting = [
    ...new Set(
      docs
        .flatMap((d) => d.pending)
        .filter((q) => q.mapId === snap.map.id && q.ticketId)
        .map((q) => q.ticketId!),
    ),
  ].filter((id) => byId(id));
  if (waiting.length === 1) return byId(waiting[0]);
  return open.filter((t) => isDecisionTicket(t) && t.assignee).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export async function changeTrail(ctx: SlackContext, view: Payload, mapId: string) {
  const meta = JSON.parse(view.private_metadata) as DecisionMeta;
  const values = (view.state?.values ?? {}) as Record<string, Record<string, Payload>>;
  meta.mid = mapId;
  const adapter = await ctx.o.active();
  const maps = await adapter.listMaps();
  const form = await decisionForm(
    ctx,
    adapter,
    { maps, mapId },
    {
      decision: String(values.decision?.value?.value ?? ''),
      summary: String(values.summary?.value?.value ?? ''),
      count: 0,
      meta,
    },
  );
  if (form.thread) form.thread.count = 0;
  await ctx.call('views.update', {
    view_id: view.id,
    hash: view.hash,
    view: decisionModal(form, JSON.stringify(meta)),
  });
}
