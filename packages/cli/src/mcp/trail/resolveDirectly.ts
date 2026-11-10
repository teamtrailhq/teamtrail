import { resolve, type DecisionMeta, type MapSnapshot, type SessionHandle, type Ticket } from '@teamtrail/core';
import type { AgentContext } from './agentContext';

/** What a close without verification needs: the ticket, the closing agent and session, and what it resolved. */
interface Direct {
  ctx: AgentContext;
  input: { resolution: string; summary?: string };
  snap: MapSnapshot;
  ticket: Ticket;
  agent: string;
  session: SessionHandle;
}

/** Resolves a ticket with no verification: the resolution, the decision record and the transcript, at once. */
export async function resolveDirectly(c: Direct, parts: { meta: DecisionMeta; transcript?: string }) {
  const { ctx, input, snap, ticket: t, session: s } = c;
  if (s.info.mode === 'research') s.step(3, `${t.key} decided`);
  else s.step(4, `${parts.transcript ? 'transcript + ' : ''}comment + close + record decision`);
  const answer = { answer: input.resolution, summary: input.summary, author: c.agent };
  await resolve(ctx.adapter, snap.map.id, t.id, {
    ...ctx.actor(),
    ...answer,
    transcript: parts.transcript,
    decision: parts.meta,
  });
}
