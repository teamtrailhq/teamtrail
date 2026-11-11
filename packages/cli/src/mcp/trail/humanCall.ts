import { OperationError, recordDecision as saveDecision, type MapSnapshot } from '@teamtrail/core';
import type { AgentContext } from './agentContext';
import { humanAnswerFor, humanDecision, release, spend, type HumanAnswer } from './humanAnswer';
import { aboutArg, aboutText, type QuestionAbout } from './questionAbout';

/*
 * Settings that are the trail lead's (skipping discovery, the trail's mode, its destination) change through an
 * agent only on the human's answer to a question asked about exactly that change, given in the Lookout or Slack
 * and not as an fyi: for every agent, local or remote (remote sessions can't pass those inputs at all). The human
 * changes them in the Lookout themselves too. The answer backs that one change, and the change is kept as their
 * decision, with the question as asked and their words, so they see what it rested on.
 */

/** The answer that lets the agent make this change, taken; refuses, saying how to get one, when there is none. */
export function humanCallFor(ctx: AgentContext, about: QuestionAbout, questionId?: string): HumanAnswer {
  const answer = humanAnswerFor(ctx, { questionId, about, hitl: true });
  if (answer) return answer;
  throw new OperationError(
    `To ${aboutText(about)} is the human's call. Ask them with ask_human and about ${aboutArg(about)} (soon or blocking, not fyi), wait for their answer in the Lookout or Slack, then try again (pass its questionId). An answer given in an agent's chat only guides.${hint(about)}`,
  );
}

const hint = (about: QuestionAbout) =>
  about.kind === 'destination'
    ? ' Or propose the new destination with propose_reroute (kind challenge-destination).'
    : ' The human can also change it in the Lookout.';

/** Keeps the change as the human's decision on the trail, and uses the answer up. */
export async function recordHumanCall(
  ctx: AgentContext,
  c: { answer: HumanAnswer; snap: MapSnapshot; about: QuestionAbout },
) {
  const agent = await ctx.agentId();
  const said = humanDecision(c.answer, { agent, said: `${aboutText(c.about)}: ${c.answer.answer}` });
  const rec = await saveDecision(ctx.adapter, c.snap.map.id, {
    question: said.question,
    answer: said.answer,
    summary: `${aboutText(c.about)} · ${said.summary}`.slice(0, 200),
    rationale: said.rationale,
    decidedBy: said.decidedBy,
    participants: [...new Set([agent, said.decidedBy])].map((id) => ({ id })),
    source: {
      kind: 'agent',
      ref: `${ctx.sessions.running()?.id ?? agent}/d${ctx.decisionSeq++}`,
      label: `${agent} session`,
    },
    transcript: said.transcript,
  });
  spend(c.answer, `${rec.id} (${aboutText(c.about)})`);
  return rec;
}

/** The call failed before anything changed: the answer is free again. */
export const releaseHumanCall = (a: HumanAnswer | undefined) => release(a);
