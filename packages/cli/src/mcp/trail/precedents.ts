import { findPrecedents, type DecisionRecord, type Precedent, type PrecedentQuery } from '@teamtrail/core';
import { configDir } from '@teamtrail/core/bridge';
import { otherProjectPrecedents, precedentAreas } from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';
import type { AskResult } from './types';

/** Every decision in this repo's trails. */
async function allDecisions(ctx: AgentContext): Promise<DecisionRecord[]> {
  const maps = await ctx.adapter.listMaps();
  return (await Promise.all(maps.map((m) => ctx.adapter.listDecisions(m.id)))).flat();
}

/** This repo's precedents for a question, and, when asked from this machine, those other projects share. */
export async function precedentsFor(ctx: AgentContext, query: PrecedentQuery, allProjects = false) {
  const decisions = await allDecisions(ctx);
  const here = findPrecedents({ query, decisions, areas: precedentAreas(ctx.root, decisions) });
  if (!allProjects || ctx.remote) return here;
  return [...here, ...(await otherProjectPrecedents({ configDir: configDir(), root: ctx.root, query }))];
}

const line = (p: Precedent) => `${p.id} already decided: ${p.summary} (${p.decidedBy})`;

/**
 * Before a question goes to the human: a strong precedent answers it instead, unless the agent asks anyway; then the
 * human sees the precedent with the question. Nothing for framing questions, which come before any decision.
 */
export async function precedentCheck(
  ctx: AgentContext,
  o: { query: PrecedentQuery; askAnyway?: boolean; framing?: boolean },
): Promise<{ answer?: AskResult; line?: string }> {
  if (o.framing) return {};
  const strong = (await precedentsFor(ctx, o.query)).filter((p) => p.strength === 'strong');
  if (!strong.length) return {};
  if (o.askAnyway) return { line: line(strong[0]) };
  return {
    answer: {
      answered: false,
      questionId: '',
      waitedSeconds: 0,
      precedents: strong,
      note: `Not asked: ${line(strong[0])}. Act on it. If it no longer fits, call ask_human again with askAnyway: true and say why in the question; the human will see ${strong[0].id} next to it.`,
    },
  };
}

/** `find_precedent`: the decisions already made that may answer a question, with why each matches. Read-only. */
export async function findPrecedentTool(
  ctx: AgentContext,
  input: Omit<PrecedentQuery, 'ticketId'> & { ticket?: string; trail?: string; allProjects?: boolean },
) {
  const running = ctx.sessions.running()?.info;
  let ticketId = running?.ticketId;
  if (input.ticket) {
    const snap = await ctx.resolveTrail(input.trail ?? (running?.mapId || undefined));
    ticketId = ctx.findTicket(snap, input.ticket).id;
  }
  const precedents = await precedentsFor(ctx, { ...input, ticketId }, input.allProjects === true);
  return {
    precedents,
    howTo: precedents.some((p) => p.strength === 'strong')
      ? 'A strong precedent already answers this: act on it and cite its id (relatesTo) when you record your decision.'
      : 'No decision answers this yet. Suggested ones are only similar: read them, then ask_human if the call is the human’s.',
  };
}
