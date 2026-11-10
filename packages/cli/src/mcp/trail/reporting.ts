import {
  OperationError,
  recordDecision as saveDecision,
  STEPS,
  stepTag,
  type RiskCategory,
  type MapSnapshot,
  type Ticket,
} from '@teamtrail/core';
import type { AgentContext } from './agentContext';
import { assertAssumes } from './assumptions';
import { humanAnswerFor, humanDecision, release, spend, type HumanAnswer } from './humanAnswer';
import { pathRoots } from './pathRoots';
import { checkRisk, riskOf } from './riskCheck';

export function sessionView(ctx: AgentContext) {
  const s = ctx.sessions.current?.info;
  if (!s) return null;
  return {
    id: s.id,
    agent: s.agent,
    mode: s.mode,
    step: s.step ? stepTag(s.mode, s.step) : 'BOOT',
    stepLabel: s.stepLabel,
    ticket: s.ticketId && ctx.keyOf(s.ticketId),
    status: s.status,
    usage: s.usage,
  };
}

export async function report(
  ctx: AgentContext,
  input: {
    message?: string;
    level?: 'info' | 'ok' | 'warn' | 'alert';
    step?: string | number;
    say?: string;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
  },
) {
  const s = await ctx.ensureSession();
  if (input.step !== undefined) s.step(stepNumber(STEPS[s.info.mode], input.step), input.message);
  else if (input.message) s.log(input.message, input.level ?? 'info');
  if (input.say) {
    s.say(input.say);
    ctx.sessions.note(s, 'agent', s.info.agent, input.say);
  }
  const u = {
    inputTokens: Math.max(0, input.inputTokens ?? 0),
    outputTokens: Math.max(0, input.outputTokens ?? 0),
    costUsd: Math.max(0, input.costUsd ?? 0),
  };
  const note = input.message ?? input.say;
  if (note) ctx.heartbeat({ ticketId: s.info.ticketId, note });
  const measured = ctx.sessions.measure(s);
  const reportedAny = u.inputTokens || u.outputTokens || u.costUsd;
  if (!measured && reportedAny) s.usage({ ...u, source: 'reported' });
  return { session: sessionView(ctx), usageSource: usageSource(measured, s.info.usage) };
}

/** A step given as its number or its name (any case), checked against the mode's steps. */
function stepNumber(steps: readonly string[], step: string | number): number {
  const byName = steps.findIndex((x) => x.toLowerCase() === String(step).toLowerCase()) + 1;
  const n = typeof step === 'number' ? step : byName || Number(step);
  if (!Number.isInteger(n) || n < 1 || n > steps.length)
    throw new OperationError(`step must be 1-${steps.length} or one of: ${steps.join(', ')}`);
  return n;
}

function usageSource(measured: boolean, usage?: { source?: string }): string {
  if (measured) return `${usage?.source} logs (reported numbers are ignored)`;
  if (usage) return 'reported';
  return 'none';
}

/**
 * `decidedBy` used to let the caller say who decided. Nobody can say that for the human: their decision is their
 * answer to a question, named by `questionId`.
 */
function refuseClaim(claimed: string | undefined, agent: string) {
  if (claimed === undefined || claimed === agent) return;
  throw new OperationError(
    "decidedBy can't make a decision someone else's. For a decision the human made, pass questionId: the question you asked with ask_human that they answered. Without it the decision is recorded as yours.",
  );
}

/** What record_decision takes. */
interface DecisionInput {
  trail?: string;
  ticket?: string;
  question: string;
  answer: string;
  summary?: string;
  rationale?: string;
  alternatives?: string[];
  decidedBy?: string;
  /** The answered question this decision is the human's by. */
  questionId?: string;
  appendToTrail?: boolean;
  category?: RiskCategory;
  paths?: string[];
  assumes?: string[];
}

export async function recordDecision(ctx: AgentContext, input: DecisionInput) {
  const s = ctx.sessions.running();
  const snap = await ctx.resolveTrail(input.trail ?? (s?.info.mapId || undefined));
  const agent = await ctx.agentId();
  const t = input.ticket ? ctx.findTicket(snap, input.ticket) : undefined;
  refuseClaim(input.decidedBy, agent);
  const subject = { root: ctx.root, category: input.category, paths: input.paths, roots: pathRoots(ctx) };
  const answered = humanAnswerFor(ctx, {
    questionId: input.questionId,
    category: input.category,
    risk: riskOf(subject),
  });
  try {
    const rec = await saveWith(ctx, { input, agent, answered, snap, ticket: t });
    spend(answered, rec.id);
    ctx.heartbeat({ ticketId: t?.id ?? s?.info.ticketId, decision: `${rec.id} · ${rec.summary}` });
    return { decision: rec };
  } catch (e) {
    release(answered);
    throw e;
  }
}

/** Writes the record: the human's (the question as asked, their words) or the agent's own (what it passed). */
async function saveWith(
  ctx: AgentContext,
  c: { input: DecisionInput; agent: string; answered?: HumanAnswer; snap: MapSnapshot; ticket?: Ticket },
) {
  const { input, agent, answered, ticket: t } = c;
  const s = ctx.sessions.running();
  const said = answered
    ? humanDecision(answered, { agent, said: input.answer, rationale: input.rationale })
    : { ...input, decidedBy: agent, transcript: undefined };
  const { decidedBy } = said;
  const roots = pathRoots(ctx);
  const risk = checkRisk({ root: ctx.root, category: input.category, paths: input.paths, roots, decidedBy });
  assertAssumes(c.snap, input.assumes);
  return saveDecision(
    ctx.adapter,
    c.snap.map.id,
    {
      ticketId: t?.id,
      ticketKey: t?.key,
      question: said.question,
      answer: said.answer,
      summary: said.summary,
      alternatives: input.alternatives,
      rationale: said.rationale,
      decidedBy,
      participants: [...new Set([agent, decidedBy])].map((id) => ({ id })),
      source: {
        kind: 'agent',
        ref: `${s?.id ?? `${agent}@${process.pid}`}/d${ctx.decisionSeq++}`,
        label: `${agent} session`,
      },
      ...(risk ? { risk } : {}),
      ...(input.assumes?.length ? { assumes: input.assumes } : {}),
      ...(said.transcript ? { transcript: said.transcript } : {}),
    },
    { appendToTrail: input.appendToTrail },
  );
}
