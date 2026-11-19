import {
  approvesGates,
  approvesHighRisk,
  attention,
  chatNote,
  OperationError,
  type AnswerVia,
  type AttentionKind,
  type RiskCategory,
} from '@teamtrail/core';
import { lookoutOnlyTickets, needsLookout, readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { rankedAttention } from './attention';
import { CHAT_GUIDES, LIMITED_HIGH_RISK, SLACK_HIGH_RISK } from './humanAnswer';
import { precedentCheck } from './precedents';
import { trailNameFamily } from './trailName';
import { TRAIL_LEAD, type AskResult, type WaitControl } from './types';

export async function ask(ctx: AgentContext, input: AskInput, ctl: WaitControl = {}): Promise<AskResult> {
  const s = input.framing ? await ctx.chartSession() : await ctx.ensureSession();
  const query = { ...input, text: input.question, ticketId: s.info.ticketId, categories: askedCategories(input) };
  const precedent = await precedentCheck(ctx, { query, askAnyway: input.askAnyway, framing: input.framing });
  if (precedent.answer) return precedent.answer;
  if (input.framing && s.info.step === 0) s.step(1, 'framing interview');
  ctx.sessions.note(s, 'agent', s.info.agent, input.question);
  const blocks = await blockedIds(ctx, s.info.mapId, input.blocks);
  const suggestions = input.suggestions?.length ? input.suggestions : undefined;
  const answer = s.ask(input.question, suggestions, { urgency: input.urgency, blocks });
  const q = ctx.activity.snapshot.pending.filter((p) => p.sessionId === s.id).at(-1)!;
  const categories = askedCategories(input);
  const stakes = stakesOf(ctx, { input, mapId: s.info.mapId, ticketId: s.info.ticketId });
  if (stakes) q.stakes = stakes;
  if (precedent.line) q.precedent = precedent.line;
  if (categories.length) q.category = categories[0];
  if (categories.length > 1) q.categories = categories;
  // Said with the question, so a Lookout whose caller may not make high-risk calls routes it to someone who may.
  // Only a hint for the page: the answer route decides, whatever this says.
  if (needsLookout.question(ctx.root, { categories })) q.lookoutOnly = true;
  ctx.writer.flush();
  const sid = s.id;
  // The ticket the question is about: the one this session holds as it asks.
  const askedOn = s.info.ticketId;
  // A high-risk question marks its ticket for good, in the machine store: it is decided in the Lookout only.
  if (askedOn && needsLookout.question(ctx.root, { categories }))
    lookoutOnlyTickets.mark(ctx.root, { mapId: s.info.mapId, ticketId: askedOn, categories });
  ctx.waits.set(
    q.id,
    answer.then((text) => {
      // The answer used, never one kept after it as not used.
      const author =
        ctx.activity.snapshot.chats.find((c) => c.answers === q.id && c.from === 'human' && !c.notUsed)?.author ??
        TRAIL_LEAD;
      // How it was given, as the path that delivered it recorded (answerVia.ts); none on an older, unlabelled one.
      const { via, chatOf, by } = ctx.activity.snapshot.answered.find((a) => a.id === q.id) ?? {};
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
        ...(by ? { by } : {}),
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
  /** Files it touches, assumptions it relies on, decisions it relates to: matched against earlier decisions. */
  paths?: string[];
  assumes?: string[];
  relatesTo?: string[];
  /** Ask even though an earlier decision seems to answer it. */
  askAnyway?: boolean;
}

/** What the answer lets the agent do, for the Lookout and Slack to show with the question. */
function stakesOf(ctx: AgentContext, c: { input: AskInput; mapId: string; ticketId?: string }) {
  const t = c.ticketId ? ctx.seen(c.mapId, c.ticketId) : undefined;
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
    ...viaOf(ctx, res.a.via, input.questionId),
    waitedSeconds: waited(),
  };
}

/** How the answer was given, and for one that can't approve gates, what that means for the agent. */
function viaOf(ctx: AgentContext, via: AnswerVia | undefined, questionId: string) {
  const categories = ctx.answers.get(questionId)?.categories ?? [];
  if (approvesGates(via) && !approvesHighRisk(via) && needsLookout.question(ctx.root, { categories }))
    return { answeredVia: via, note: via === 'lookout-limited' ? LIMITED_HIGH_RISK : SLACK_HIGH_RISK };
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
        ticket: q.ticketId ? ctx.keyOf(q.ticketId, q.mapId) : undefined,
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
  // A question of this process's own goes in line like any other answer, so the first one given is the one used.
  if (ctx.activity.snapshot.pending.some((p) => p.id === input.questionId)) ctx.writer.flush();
  const doc = (await readAgentDocs(ctx.root)).find((d) => d.pending.some((q) => q.id === input.questionId));
  if (!doc) throw new OperationError(`No open question ${input.questionId}. Call list_inbox for the current ones.`);
  const written = writeAgentAnswer(ctx.root, {
    sessionId: doc.session.id,
    questionId: input.questionId,
    text: input.answer,
    author: TRAIL_LEAD,
    via: 'chat',
    chatOf,
  });
  ctx.writer.pullAnswers();
  if (written.firstAnswer)
    return { delivered: false, to: doc.session.agent, note: alreadyAnswered(written.firstAnswer) };
  return { delivered: true, to: doc.session.agent, ...given };
}

/** What answer_question says when another answer came first: that one is used, this one kept as not used. */
const alreadyAnswered = (first: { author: string; via?: AnswerVia }) =>
  `Already answered by ${first.author}${first.via ? ` (${first.via})` : ''}: that answer is the one used. Yours is kept in the conversation, marked not used.`;
