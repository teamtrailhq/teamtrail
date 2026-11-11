import {
  approvesGates,
  attention,
  chatNote,
  OperationError,
  type AnswerVia,
  type AttentionKind,
  type RiskCategory,
} from '@teamtrail/core';
import { readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { rankedAttention } from './attention';
import { CHAT_GUIDES } from './humanAnswer';
import { trailNameFamily } from './trailName';
import { TRAIL_LEAD, type AskResult, type WaitControl } from './types';

export async function ask(ctx: AgentContext, input: AskInput, ctl: WaitControl = {}): Promise<AskResult> {
  const s = input.framing ? await ctx.chartSession() : await ctx.ensureSession();
  if (input.framing && s.info.step === 0) s.step(1, 'framing interview');
  ctx.sessions.note(s, 'agent', s.info.agent, input.question);
  const blocks = await blockedIds(ctx, s.info.mapId, input.blocks);
  const suggestions = input.suggestions?.length ? input.suggestions : undefined;
  const answer = s.ask(input.question, suggestions, { urgency: input.urgency, blocks });
  const q = ctx.activity.snapshot.pending.filter((p) => p.sessionId === s.id).at(-1)!;
  const categories = askedCategories(input);
  const stakes = stakesOf(ctx, { input, agent: s.info.agent, ticketId: s.info.ticketId });
  if (stakes) q.stakes = stakes;
  if (categories.length) q.category = categories[0];
  if (categories.length > 1) q.categories = categories;
  ctx.writer.flush();
  const sid = s.id;
  // The ticket the question is about: the one this session holds as it asks.
  const askedOn = s.info.ticketId;
  ctx.waits.set(
    q.id,
    answer.then((text) => {
      const author =
        [...ctx.activity.snapshot.chats].reverse().find((c) => c.sessionId === sid && c.from === 'human')?.author ??
        TRAIL_LEAD;
      // How it was given, as the path that delivered it recorded (answerVia.ts); none on an older, unlabelled one.
      const { via, chatOf } = ctx.activity.snapshot.answered.find((a) => a.id === q.id) ?? {};
      const at = Date.now();
      const where = chatNote({ via, chatOf });
      const said = where ? `${author} (${where})` : author;
      ctx.sessions.transcript(sid)?.push({ from: 'human', author: said, text, at });
      ctx.answers.set(q.id, {
        questionId: q.id,
        question: input.question,
        answer: text,
        author,
        at,
        mapId: s.info.mapId,
        ticketId: askedOn,
        categories,
        urgency: input.urgency ?? 'soon',
        transcript: ctx.sessions.transcript(sid) ?? [],
        via,
        chatOf,
      });
      return { text, author, via };
    }),
  );
  return waitForAnswer(ctx, { questionId: q.id, waitSeconds: input.waitSeconds }, ctl);
}

/** `category` and `categories` as one list, without repeats. */
const askedCategories = (input: AskInput) =>
  [...new Set([input.category, ...(input.categories ?? [])])].filter((c): c is RiskCategory => !!c);

export interface AskInput {
  question: string;
  /** What the call touches (risk policy). */
  category?: RiskCategory;
  /** More than one category; `category` counts as one of them. */
  categories?: RiskCategory[];
  suggestions?: string[];
  waitSeconds?: number;
  framing?: boolean;
  urgency?: 'blocking' | 'soon' | 'fyi';
  /** Ticket refs that can't move until this is answered. */
  blocks?: string[];
}

/** What the answer lets the agent do, for the Lookout and Slack to show with the question. */
function stakesOf(ctx: AgentContext, c: { input: AskInput; agent: string; ticketId?: string }) {
  const t = c.ticketId ? ctx.seen(c.ticketId) : undefined;
  if (!t || attention(t) !== 'hitl' || c.input.urgency === 'fyi') return undefined;
  return `Answering this decides ${t.key}`;
}

/** Ticket refs to ids in the session's trail; none before the trail exists (framing). */
async function blockedIds(ctx: AgentContext, mapId: string, refs?: string[]): Promise<string[] | undefined> {
  if (!refs?.length || !mapId) return undefined;
  const snap = await ctx.load(mapId);
  return refs.map((r) => ctx.findTicket(snap, r).id);
}

export async function waitForAnswer(
  ctx: AgentContext,
  input: { questionId: string; waitSeconds?: number },
  ctl: WaitControl = {},
): Promise<AskResult> {
  const p = ctx.waits.get(input.questionId);
  if (!p)
    throw new OperationError(
      `Unknown question ${input.questionId} (questions only live as long as the session that asked them)`,
    );
  const started = Date.now();
  const waited = () => Math.round((Date.now() - started) / 1000);
  const limit = Math.max(0, input.waitSeconds ?? defaultWaitSeconds(ctx)) * 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  let onAbort = () => {};
  const res = await Promise.race([
    p.then((a) => ({ answered: true as const, a })),
    new Promise<{ answered: false }>((r) => {
      timer = setTimeout(() => r({ answered: false }), limit);
      onAbort = () => r({ answered: false });
      ctl.signal?.addEventListener('abort', onAbort, { once: true });
      tick = setInterval(() => {
        ctx.heartbeat();
        ctl.onProgress?.(waited());
      }, 15_000);
    }),
  ]).finally(() => {
    clearTimeout(timer);
    clearInterval(tick);
    ctl.signal?.removeEventListener('abort', onAbort);
  });
  if (!res.answered) return { answered: false, questionId: input.questionId, waitedSeconds: waited() };
  ctx.waits.delete(input.questionId);
  return {
    answered: true,
    questionId: input.questionId,
    answer: res.a.text,
    answeredBy: res.a.author,
    ...viaOf(ctx, res.a.via),
    waitedSeconds: waited(),
  };
}

/** How the answer was given, and for one that can't approve gates, what that means for the agent. */
function viaOf(ctx: AgentContext, via: AnswerVia | undefined) {
  if (approvesGates(via)) return { answeredVia: via };
  if (via) return { answeredVia: via, note: CHAT_GUIDES };
  // Unlabelled: written by a Teamtrail from before labels, or its label didn't verify. Either way it only guides.
  const look = ctx.lookout();
  const skew = 'versionNote' in look ? look.versionNote : undefined;
  const why = skew ?? 'It carries no label that verifies, so it counts as given in a chat.';
  return { answeredVia: 'chat' as const, note: `${why} ${CHAT_GUIDES}` };
}

export function defaultWaitSeconds(ctx: AgentContext) {
  return trailNameFamily(ctx.opts.client?.()) === 'codex' ? 50 : 600;
}

/** Open questions (oldest first, unchanged shape) plus the ranked attention queue. */
export async function inbox(ctx: AgentContext, input: { kinds?: AttentionKind[] } = {}) {
  const docs = await readAgentDocs(ctx.root);
  const maps = new Map((await ctx.adapter.listMaps()).map((m) => [m.id, m]));
  return {
    questions: docs
      .flatMap((d) => d.pending.map((q) => ({ q, d })))
      .sort((a, b) => a.q.at - b.q.at)
      .map(({ q, d }) => ({
        questionId: q.id,
        sessionId: q.sessionId,
        agent: q.agent,
        trail: maps.get(q.mapId)?.title ?? (q.mapId ? q.mapId : 'new trail (framing)'),
        ticket: q.ticketId ? ctx.keyOf(q.ticketId) : undefined,
        question: q.text,
        suggestions: q.suggestions,
        ...(q.category ? { category: q.category } : {}),
        ...(q.categories ? { categories: q.categories } : {}),
        askedSecondsAgo: Math.round((Date.now() - q.at) / 1000),
        step: d.session.stepLabel,
      })),
    attention: await rankedAttention(ctx, input.kinds),
    lookout: ctx.lookout(),
  };
}

/**
 * The human's words from this agent's chat, passed on to the agent that asked. Labelled `chat` here, whatever was
 * passed: it guides that agent, and never stands in for the human at a gate (answerVia.ts).
 */
export async function answerQuestion(ctx: AgentContext, input: { questionId: string; answer: string }) {
  const chatOf = await ctx.agentId();
  const given = { via: 'chat' as const, note: CHAT_GUIDES };
  const own = ctx.activity.snapshot.pending.find((p) => p.id === input.questionId);
  if (own) {
    ctx.activity.answer(own.id, input.answer.trim(), TRAIL_LEAD, { via: 'chat', chatOf });
    return { delivered: true, to: own.agent, ...given };
  }
  const doc = (await readAgentDocs(ctx.root)).find((d) => d.pending.some((q) => q.id === input.questionId));
  if (!doc) throw new OperationError(`No open question ${input.questionId}. Call list_inbox for the current ones.`);
  writeAgentAnswer(ctx.root, {
    sessionId: doc.session.id,
    questionId: input.questionId,
    text: input.answer,
    author: TRAIL_LEAD,
    via: 'chat',
    chatOf,
  });
  return { delivered: true, to: doc.session.agent, ...given };
}
