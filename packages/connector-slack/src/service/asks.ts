import { BRAND, type AgentSessionDoc, type PendingQuestion, type TrackerAdapter } from '@teamtrail/core';
import { AnswerError, attentionView, readAgentDocs, writeAgentAnswer } from '@teamtrail/core/bridge';
import { askClosedMessage, askMessage, clip, label, mention, type AskRef, type AskView } from '../blocks';
import type { SlackConfig } from '../store';
import { takeAskSlot } from './askLimit';
import { askRoute } from './askRoute';
import { queueLine } from './queueLine';
import { refusedForGood } from './refusedForGood';
import type { SlackContext } from './slackContext';

export async function askView(
  ctx: SlackContext,
  q: PendingQuestion,
  adapter?: TrackerAdapter,
): Promise<AskView & { mapId: string; ticketId?: string; at: number }> {
  let trail: string | undefined;
  let ticket: string | undefined;
  try {
    const snap = await (adapter ?? (await ctx.o.active())).loadMap(q.mapId);
    trail = snap.map.title;
    const t = snap.tickets.find((x) => x.id === q.ticketId);
    ticket = t ? `${t.key} ${t.title}` : undefined;
  } catch {
    /* trail unknown to the active tracker: show the ask without it */
  }
  return {
    sessionId: q.sessionId,
    questionId: q.id,
    text: q.text,
    suggestions: q.suggestions,
    agent: q.agent,
    trail,
    ticket,
    mapId: q.mapId,
    ticketId: q.ticketId,
    at: q.at,
  };
}

export async function pendingAsk(ctx: SlackContext, ref: AskRef) {
  const docs = await readAgentDocs(ctx.o.root);
  const q = docs.find((d) => d.session.id === ref.s)?.pending.find((x) => x.id === ref.q);
  return q ? { q, view: await askView(ctx, q) } : undefined;
}

/** Compare-and-set: only the first answer to an open question is delivered. */
export function writeAnswer(ctx: SlackContext, ref: AskRef, text: string, user: string) {
  if (ctx.answering.has(ref.q)) return false;
  ctx.answering.add(ref.q);
  try {
    writeAgentAnswer(ctx.o.root, { sessionId: ref.s, questionId: ref.q, text, author: `slack:${user}`, via: 'slack' });
  } catch (e) {
    if (e instanceof AnswerError) return false;
    ctx.answering.delete(ref.q);
    throw e;
  }
  const asks = ctx.asks.read();
  if (asks[ref.q]) {
    asks[ref.q].by = { user, text };
    ctx.asks.write(asks);
  }
  return true;
}

export async function answer(ctx: SlackContext, ref: AskRef, text: string, user: string) {
  if (!writeAnswer(ctx, ref, text, user)) return false;
  await closeAsk(ctx, ref.q);
  return true;
}

/** Replace the ask's buttons with its outcome. */
export async function closeAsk(ctx: SlackContext, questionId: string, docs?: AgentSessionDoc[]) {
  const asks = ctx.asks.read();
  const rec = asks[questionId];
  if (!rec || rec.closed || !rec.view) return;
  let line: string;
  let answered = true;
  if (rec.by)
    line = `✓ Answered by ${mention(rec.by.user)} via Slack: “${label(clip(rec.by.text, 300))}”. ${label(rec.view.agent)} resumed.`;
  else {
    const doc = (docs ?? (await readAgentDocs(ctx.o.root))).find((d) => d.session.id === rec.sessionId);
    const reply = doc?.chats.find((c) => c.from === 'human' && c.at >= rec.view!.at);
    answered = !!reply;
    line = reply
      ? `✓ Answered in ${BRAND.name} by ${label(reply.author)}: “${label(clip(reply.text, 300))}”.`
      : `No longer waiting: ${label(rec.view.agent)} ${doc?.session.status === 'running' ? 'withdrew the question' : 'session ended'}.`;
  }
  rec.closed = true;
  ctx.asks.write(asks);
  const detail = ctx.store.read().notify.detail;
  await ctx
    .call('chat.update', {
      channel: rec.channel,
      ts: rec.ts,
      ...askClosedMessage(rec.view, line, { detail, answered }),
    })
    .catch(() => {});
}

export async function syncAsks(ctx: SlackContext, docs: AgentSessionDoc[], c: SlackConfig) {
  const asks = ctx.asks.read();
  const pending = docs.flatMap((d) => d.pending);
  const fresh = c.notify.events.includes('awaiting') ? pending.filter((q) => !asks[q.id]) : [];
  if (fresh.length && !(await postAsks(ctx, fresh, c))) return;
  const open = new Set(pending.map((q) => q.id));
  for (const [id, rec] of Object.entries(asks)) if (!rec.closed && !open.has(id)) await closeAsk(ctx, id, docs);
}

/**
 * Posts new questions as asks. The ones that don't interrupt (with interrupt gating), the ones past an agent's
 * limit (askLimit.ts), and one Slack refuses to post, go to the trail's digest instead; the rest still go out.
 */
async function postAsks(ctx: SlackContext, fresh: PendingQuestion[], c: SlackConfig): Promise<boolean> {
  let adapter: TrackerAdapter | undefined;
  const queue = ctx.o.interruptOnly
    ? await attentionView({ root: ctx.o.root, adapter: (adapter = await ctx.o.active()), configDir: ctx.o.configDir })
    : undefined;
  for (const q of fresh) {
    if (ctx.capped.has(q.id) || askRoute(q, queue) === 'digest') {
      digestOnce(ctx, q);
      continue;
    }
    const channel = await ctx.target();
    if (!channel) return false;
    if (!takeAskSlot(ctx, q.agent)) {
      ctx.capped.add(q.id);
      digestOnce(ctx, q);
      continue;
    }
    adapter ??= await ctx.o.active();
    const view = await askView(ctx, q, adapter);
    try {
      const r = await ctx.call<{ channel: string; ts: string }>('chat.postMessage', {
        channel,
        ...askMessage(view, { url: ctx.o.url(), detail: c.notify.detail }),
      });
      const asks = ctx.asks.read();
      asks[q.id] = { sessionId: q.sessionId, channel: r.channel, ts: r.ts, view };
      ctx.asks.write(asks);
    } catch (e) {
      if (!refusedForGood(e)) throw e;
      ctx.capped.add(q.id);
      digestOnce(ctx, q);
    }
  }
  return true;
}

/** A question that doesn't interrupt: one line in its trail's next digest, once. */
function digestOnce(ctx: SlackContext, q: PendingQuestion) {
  if (ctx.digested.has(q.id)) return;
  ctx.digested.add(q.id);
  queueLine(ctx, q.mapId, `${label(q.agent)} asks: ${label(clip(q.text, 200))} (answer in ${BRAND.name})`);
}
