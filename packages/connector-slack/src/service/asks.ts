import {
  BRAND,
  questionHeadline,
  type AgentSessionDoc,
  type FirstAnswer,
  type PendingQuestion,
  type TrackerAdapter,
} from '@teamtrail/core';
import { needsLookout } from '@teamtrail/core/agents';
import { AnswerError, LookoutOnlyAnswer, attentionView, readAgentDocs, writeAgentAnswer } from '@teamtrail/core/bridge';
import { askClosedMessage, askMessage, label, type AskRef, type AskView } from '../blocks';
import type { AskRecord, SlackConfig } from '../store';
import { takeAskSlot } from './askLimit';
import { askOutcome } from './askOutcome';
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
    ...(q.summary ? { summary: q.summary } : {}),
    suggestions: q.suggestions,
    agent: q.agent,
    ...(q.stakes ? { stakes: q.stakes } : {}),
    ...(q.precedent ? { precedent: q.precedent } : {}),
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

/** A question the risk policy makes high risk is answered in the Lookout only: no answer buttons in Slack. */
export const askMode = (ctx: SlackContext, q: PendingQuestion) =>
  needsLookout.question(ctx.o.root, q) ? ('lookout' as const) : ('buttons' as const);

/**
 * Compare-and-set: only the first answer to an open question is delivered. A high-risk question takes no answer
 * from Slack (core refuses it, agentDocs.ts): `lookout`.
 */
export function writeAnswer(ctx: SlackContext, ref: AskRef, text: string, user: string): 'ok' | 'taken' | 'lookout' {
  if (ctx.answering.has(ref.q)) return 'taken';
  ctx.answering.add(ref.q);
  let first: NonNullable<AskRecord['by']>['first'];
  try {
    const author = `slack:${user}`;
    const written = writeAgentAnswer(ctx.o.root, { sessionId: ref.s, questionId: ref.q, text, author, via: 'slack' });
    first = written.firstAnswer && firstOf(written.firstAnswer);
  } catch (e) {
    ctx.answering.delete(ref.q);
    if (e instanceof LookoutOnlyAnswer) return 'lookout';
    if (e instanceof AnswerError) return 'taken';
    throw e;
  }
  const asks = ctx.asks.read();
  if (asks[ref.q]) {
    asks[ref.q].by = { user, text, ...(first ? { first } : {}) };
    ctx.asks.write(asks);
  }
  return 'ok';
}

export async function answer(ctx: SlackContext, ref: AskRef, text: string, user: string) {
  const r = writeAnswer(ctx, ref, text, user);
  if (r === 'ok') await closeAsk(ctx, ref.q);
  return r;
}

/** The answer that came before this one, as the card shows it: who, what and how, never who signed in. */
const firstOf = (a: FirstAnswer) => ({
  author: a.author,
  text: a.text,
  ...(a.via ? { via: a.via } : {}),
  ...(a.chatOf ? { chatOf: a.chatOf } : {}),
});

/** Replace the ask's buttons with its outcome (askOutcome.ts when it was answered or dropped elsewhere). */
export async function closeAsk(ctx: SlackContext, questionId: string, docs?: AgentSessionDoc[]) {
  const asks = ctx.asks.read();
  const rec = asks[questionId];
  if (!rec || rec.closed || !rec.view) return;
  const doc = rec.by
    ? undefined
    : (docs ?? (await readAgentDocs(ctx.o.root))).find((d) => d.session.id === rec.sessionId);
  const { line, answered, guidance } = askOutcome({ doc, questionId, agent: rec.view.agent, slack: rec.by });
  rec.closed = true;
  ctx.asks.write(asks);
  const detail = ctx.store.read().notify.detail;
  await ctx
    .call('chat.update', {
      channel: rec.channel,
      ts: rec.ts,
      ...askClosedMessage(rec.view, line, { detail, answered, ...(guidance ? { url: ctx.o.url() } : {}) }),
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
  await refreshModes(ctx, pending, c);
}

/**
 * A waiting question whose risk changed since its message was posted (the risk policy, or a ticket that became the
 * Lookout's) is shown again: buttons where Slack may answer it, Open in Lookout where only the Lookout may.
 */
async function refreshModes(ctx: SlackContext, pending: PendingQuestion[], c: SlackConfig) {
  const asks = ctx.asks.read();
  for (const q of pending) {
    const rec = asks[q.id];
    if (!rec || rec.closed || !rec.view) continue;
    const mode = askMode(ctx, q);
    if (mode === (rec.mode ?? 'buttons')) continue;
    const message = askMessage(rec.view, { url: ctx.o.url(), detail: c.notify.detail, mode });
    const ok = await ctx.call('chat.update', { channel: rec.channel, ts: rec.ts, ...message }).then(
      () => true,
      () => false,
    );
    if (!ok) continue;
    rec.mode = mode;
    ctx.asks.write(asks);
  }
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
      const mode = askMode(ctx, q);
      const r = await ctx.call<{ channel: string; ts: string }>('chat.postMessage', {
        channel,
        ...askMessage(view, { url: ctx.o.url(), detail: c.notify.detail, mode }),
      });
      const asks = ctx.asks.read();
      asks[q.id] = { sessionId: q.sessionId, channel: r.channel, ts: r.ts, view, mode };
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
  queueLine(ctx, q.mapId, `${label(q.agent)} asks: ${label(questionHeadline(q).text)} (answer in ${BRAND.name})`);
}
