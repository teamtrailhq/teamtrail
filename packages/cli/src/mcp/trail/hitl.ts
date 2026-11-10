import { OperationError, type AttentionKind, type RiskCategory } from '@teamtrail/core';
import { readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { rankedAttention } from './attention';
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
  if (input.category) q.category = input.category;
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
      const at = Date.now();
      ctx.sessions.transcript(sid)?.push({ from: 'human', author, text, at });
      ctx.answers.set(q.id, {
        questionId: q.id,
        question: input.question,
        answer: text,
        author,
        at,
        mapId: s.info.mapId,
        ticketId: askedOn,
        category: input.category,
        urgency: input.urgency ?? 'soon',
        transcript: ctx.sessions.transcript(sid) ?? [],
      });
      return { text, author };
    }),
  );
  return waitForAnswer(ctx, { questionId: q.id, waitSeconds: input.waitSeconds }, ctl);
}

export interface AskInput {
  question: string;
  /** What the call touches (risk policy). */
  category?: RiskCategory;
  suggestions?: string[];
  waitSeconds?: number;
  framing?: boolean;
  urgency?: 'blocking' | 'soon' | 'fyi';
  /** Ticket refs that can't move until this is answered. */
  blocks?: string[];
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
    waitedSeconds: waited(),
  };
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
        askedSecondsAgo: Math.round((Date.now() - q.at) / 1000),
        step: d.session.stepLabel,
      })),
    attention: await rankedAttention(ctx, input.kinds),
    lookout: ctx.lookout(),
  };
}

export async function answerQuestion(ctx: AgentContext, input: { questionId: string; answer: string }) {
  const own = ctx.activity.snapshot.pending.find((p) => p.id === input.questionId);
  if (own) {
    ctx.activity.answer(own.id, input.answer.trim(), TRAIL_LEAD);
    return { delivered: true, to: own.agent };
  }
  const doc = (await readAgentDocs(ctx.root)).find((d) => d.pending.some((q) => q.id === input.questionId));
  if (!doc) throw new OperationError(`No open question ${input.questionId}. Call list_inbox for the current ones.`);
  writeAgentAnswer(ctx.root, {
    sessionId: doc.session.id,
    questionId: input.questionId,
    text: input.answer,
    author: TRAIL_LEAD,
  });
  return { delivered: true, to: doc.session.agent };
}
