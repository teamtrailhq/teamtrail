import type { RiskLevel } from '@teamtrail/core';
import { shortModel, TRAIL_LEAD } from '../../lib';
import { workToProve } from '../proof';
import type { ChipInput, LoadedTicket } from './types';

const RANK: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2 };

/** What the ticket's chips say, read from what the inspector loaded for it (chipsOfTicket lays them out). */
export function chipInput(v: LoadedTicket): ChipInput {
  return { key: v.t.key, type: v.t.type, state: v.state, agent: agentOf(v), proof: proofOf(v), risk: riskOf(v) };
}

/** The agent at work (its session, else its claim), or for done work the one whose completion it is. */
function agentOf(v: LoadedTicket): ChipInput['agent'] {
  const s = v.session;
  if (s) return { name: s.agent, model: shortModel(s.model), modelId: s.model, working: true };
  if (v.lease) return { name: v.lease.agent, working: true };
  if (v.state === 'claimed' && v.t.assignee) return { name: whoName(v.t.assignee), working: true };
  const attempt = v.proof?.proof.attempt;
  if (v.state !== 'decided' || !attempt?.id) return undefined;
  return { name: attempt.agent, model: shortModel(attempt.model), modelId: attempt.model, working: false };
}

const whoName = (assignee: string) => (assignee === TRAIL_LEAD ? 'you' : assignee);

/** Done work's proof, where there was work to prove. */
function proofOf(v: LoadedTicket): ChipInput['proof'] {
  const proof = v.proof?.proof;
  if (!proof || v.state !== 'decided' || !workToProve(v.t, proof)) return undefined;
  return { verified: proof.status === 'verified', gap: proof.gaps[0] };
}

/** The highest risk on it: a decision's level, a question asked as high risk, a risky change the policy caught. */
function riskOf(v: LoadedTicket): ChipInput['risk'] {
  const found: NonNullable<ChipInput['risk']>[] = v.decisions.flatMap((d) =>
    d.risk ? [{ level: d.risk.level, reason: `${d.id}: ${d.risk.reason}` }] : [],
  );
  if (v.question?.lookoutOnly) found.push({ level: 'high', reason: 'Its question is high risk by the risk policy' });
  const policy = v.items.find((i) => i.kind === 'policy');
  if (policy) found.push({ level: 'high', reason: policy.title });
  return found.sort((a, b) => RANK[b.level] - RANK[a.level])[0];
}
